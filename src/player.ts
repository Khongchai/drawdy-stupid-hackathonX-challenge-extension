import type { CollaborationUserPresence } from "@drawdy/driver-protocol";
import { CommandError, send } from "./host";

export type SelfLookup =
    | { kind: "found"; user: CollaborationUserPresence }
    | { kind: "denied" }
    | { kind: "unavailable" };

export function selfOf(users: readonly CollaborationUserPresence[]): CollaborationUserPresence | null {
    return users.find((u) => u.isSelf) ?? null;
}

export async function lookUpSelf(): Promise<SelfLookup> {
    try {
        const { users } = await send({ type: "command:collaboration:get-all-users-in-board" });
        const user = selfOf(users);
        return user ? { kind: "found", user } : { kind: "unavailable" };
    } catch (error) {
        if (error instanceof CommandError && error.kind === "unauthorized") return { kind: "denied" };
        return { kind: "unavailable" };
    }
}
