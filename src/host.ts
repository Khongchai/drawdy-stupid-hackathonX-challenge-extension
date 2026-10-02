import type {
    DistributiveOmit,
    DriverCommandIssuer,
    DriverCommandRequest,
    DriverCommandResponseFor,
    ModuleStyling,
} from "@drawdy/driver-protocol";

export type UnstampedRequest = DistributiveOmit<DriverCommandRequest, "driverId" | "requestId">;

type StampedRequest<C extends UnstampedRequest> = Extract<DriverCommandRequest, { type: C["type"] }>;

type SuccessValue<R> = R extends { error?: never; value: infer V } ? V : never;

export type CommandValue<C extends UnstampedRequest> = SuccessValue<
    DriverCommandResponseFor<StampedRequest<C>>["res"]
>;

export class CommandError extends Error {
    constructor(
        readonly kind: string,
        message?: string,
        readonly body?: unknown
    ) {
        super(message ? `${kind}: ${message}` : kind);
        this.name = "CommandError";
    }
}

export type Host = {
    driverId: string;
    issue: DriverCommandIssuer;
    generateId: () => string;
    styling: ModuleStyling;
};

let host: Host | null = null;
let requestSeq = 0;

export function bindHost(next: Host): void {
    host = next;
}

export function currentHost(): Host {
    if (!host) throw new Error("driver is not activated");
    return host;
}

export function newId(): string {
    return currentHost().generateId();
}

export async function send<C extends UnstampedRequest>(command: C): Promise<CommandValue<C>> {
    const h = currentHost();
    const request = {
        ...command,
        driverId: h.driverId,
        requestId: `shx-${requestSeq++}`,
    } as unknown as StampedRequest<C>;
    const response = await h.issue(request);
    const res = response.res as {
        error?: { type: string; message?: string; body?: unknown };
        value?: unknown;
    };
    if (res.error) throw new CommandError(res.error.type, res.error.message, res.error.body);
    return res.value as CommandValue<C>;
}

export async function trySend<C extends UnstampedRequest>(command: C): Promise<CommandValue<C> | null> {
    try {
        return await send(command);
    } catch (error) {
        console.warn("[stupid-hackathon-x]", command.type, error);
        return null;
    }
}

export async function subscribe<C extends UnstampedRequest & { type: `subscription:${string}` }>(
    command: C
): Promise<string | null> {
    const value = (await trySend(command)) as { subscriptionId?: string } | null;
    return value?.subscriptionId ?? null;
}

export async function unsubscribe(subscriptionId: string | null): Promise<void> {
    if (!subscriptionId) return;
    await trySend({ type: "command:subscription:remove", req: { subscriptionId } });
}
