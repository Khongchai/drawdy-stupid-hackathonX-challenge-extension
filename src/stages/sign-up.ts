import type { DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { challengeTitle } from "../challenges";
import { checkLoggedIn } from "../login";
import { lookUpSelf } from "../player";
import { addElements, updateElements } from "../scene";
import { textLine, xpWindow } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { PANEL_INK } from "../theme";

const POLL_MS = 3000;
const FAILED_CHECKS_BEFORE_PASSING = 3;

export class SignUpStage implements Stage {
    readonly id = "sign-up" as const;
    private owned: string[] = [];
    private required: string[] = [];
    private solved = false;
    private disposed = false;
    private failedChecks = 0;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;

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
            anchor: this.env.anchor,
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
        await this.check(true);
    }

    requiredIds(): Iterable<string> {
        return this.required;
    }

    ownedIds(): Iterable<string> {
        return this.owned;
    }

    handle(_event: DriverSubscriptionEvent): void {}

    private async check(first: boolean): Promise<void> {
        if (this.solved || this.disposed) return;
        const state = await checkLoggedIn();
        if (this.solved || this.disposed) return;
        if (state === "logged-in") {
            await this.pass();
            return;
        }
        if (state === "unknown" && ++this.failedChecks >= FAILED_CHECKS_BEFORE_PASSING) {
            this.solved = true;
            this.env.toast("Couldn't check if you're signed in. You pass anyway.", "info", 5000);
            this.env.complete({ lines: ["We couldn't check. You pass."], ...this.completionPlacement() });
            return;
        }
        if (first && state === "guest") this.env.toast("Sign up for Drawdy.", "info", 5000);
        this.pollTimer = setTimeout(() => void this.check(false), POLL_MS);
    }

    private async pass(): Promise<void> {
        this.solved = true;
        const self = await lookUpSelf();
        const name = self.kind === "found" ? self.user.name : null;
        this.env.toast(name ? `Signed in as ${name}.` : "Signed in.", "good", 5000);
        this.env.complete({ lines: [name ? `Hi, ${name}.` : "You're signed in."], ...this.completionPlacement() });
    }

    private completionPlacement() {
        const { x, y } = this.env.region;
        return { onPanel: true, textAt: { x: x + 284, y: y + 560 }, goAt: { x: x + 1240, y: y + 740 } };
    }

    async dispose(): Promise<void> {
        this.disposed = true;
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.pollTimer = null;
    }
}
