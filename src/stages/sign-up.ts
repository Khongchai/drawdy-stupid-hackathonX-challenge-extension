import type { CollaborationUserPresence, DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { challengeTitle } from "../challenges";
import { subscribe, unsubscribe } from "../host";
import { lookUpSelf, selfOf } from "../player";
import { addElements, updateElements } from "../scene";
import { textLine, xpWindow } from "../scene-kit";
import { looksSignedUp } from "../sign-up";
import { Stage, StageEnv } from "../stage";
import { PANEL_INK } from "../theme";

const RETRY_LOOKUP_MS = 4000;

export class SignUpStage implements Stage {
    readonly id = "sign-up" as const;
    private owned: string[] = [];
    private required: string[] = [];
    private solved = false;
    private subscriptions: (string | null)[] = [];
    private retryTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly env: StageEnv) {}

    async build(): Promise<void> {
        const { x, y, width, height } = this.env.region;
        const window = xpWindow({
            stage: this.id,
            role: "window",
            x: x + 200,
            y: y + 120,
            width: width - 400,
            height: height - 240,
            title: `${challengeTitle(this.id)} - Sign up`,
        });
        const instruction = textLine({
            stage: this.id,
            role: "instruction",
            x: x + 280,
            y: y + 300,
            text: "Sign up for Drawdy.",
            fontSize: 64,
            color: PANEL_INK.title,
        });
        const detail = textLine({
            stage: this.id,
            role: "detail",
            x: x + 284,
            y: y + 420,
            text: "Already signed in? Then you already passed.",
            fontSize: 28,
            color: PANEL_INK.body,
        });
        const elements = [...window.elements, instruction, detail];
        this.owned = elements.map((e) => e.drawdyElementId);
        this.required = [...window.ids, instruction.drawdyElementId];
        await addElements(elements);
        await updateElements(window.ids.map((id) => ({ drawdyElementId: id, properties: { locked: true } })));
        this.subscriptions = [await subscribe({ type: "subscription:collaboration:presence-changed" })];
        await this.check();
    }

    requiredIds(): Iterable<string> {
        return this.required;
    }

    ownedIds(): Iterable<string> {
        return this.owned;
    }

    handle(event: DriverSubscriptionEvent): void {
        if (this.solved || event.type !== "subscription:collaboration:presence-changed") return;
        const self = selfOf(event.body.users);
        if (self) this.judge(self, false);
    }

    private async check(): Promise<void> {
        if (this.solved) return;
        const lookup = await lookUpSelf();
        if (lookup.kind === "found") {
            this.judge(lookup.user, true);
            return;
        }
        if (lookup.kind === "denied") {
            this.solved = true;
            this.env.toast("No permission to see your name. You pass anyway.", "info", 5000);
            this.env.complete({ lines: ["We couldn't check. You pass."], ...this.completionPlacement() });
            return;
        }
        this.retryTimer = setTimeout(() => void this.check(), RETRY_LOOKUP_MS);
    }

    private judge(self: CollaborationUserPresence, remind: boolean): void {
        if (this.solved) return;
        if (!looksSignedUp(self)) {
            if (remind) this.env.toast("Sign up for Drawdy.", "info", 5000);
            return;
        }
        this.solved = true;
        this.env.toast(`Signed in as ${self.name}.`, "good", 5000);
        this.env.complete({ lines: [`Hi, ${self.name}.`], ...this.completionPlacement() });
    }

    private completionPlacement() {
        const { x, y } = this.env.region;
        return { onPanel: true, textAt: { x: x + 284, y: y + 560 }, goAt: { x: x + 1240, y: y + 740 } };
    }

    async dispose(): Promise<void> {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        for (const id of this.subscriptions) await unsubscribe(id);
        this.subscriptions = [];
    }
}
