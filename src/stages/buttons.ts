import type { DriverSubscriptionEvent, LocalAnimation } from "@drawdy/driver-protocol";
import { overlapRatio } from "../geometry";
import { addElements, elementRects, restartAnimation, updateElements } from "../scene";
import { PushButton, pushButton, textBlock, xpWindow } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { XP } from "../theme";

const REQUIRED_OVERLAP = 0.3;
const CHECK_DEBOUNCE_MS = 120;

const ONE_BUTTON_REPLIES = [
    "That was one button. The challenge says two.",
    "Still one button. At the same time, please.",
    "One click, one button. Humans only have one mouse pointer. Hmm.",
    "Have you tried being two people?",
];

function pressAnimation(): LocalAnimation {
    return {
        time: { durationMs: 220, curve: "ease-in-out", repeat: "none" },
        animation: { transform: { y: [0, 9, 0] }, curve: "linear" },
    };
}

export class ButtonsStage implements Stage {
    readonly id = "buttons" as const;
    private owned: string[] = [];
    private required: string[] = [];
    private first: PushButton | null = null;
    private second: PushButton | null = null;
    private presses = 0;
    private solved = false;
    private checkTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly env: StageEnv) {}

    async build(): Promise<void> {
        const { x, y, width, height } = this.env.region;
        const window = xpWindow({
            stage: this.id,
            role: "window",
            x: x + 40,
            y: y + 20,
            width: width - 80,
            height: height - 40,
            title: "Challenge 1 of 4 - Buttons.exe",
        });
        const instructions = textBlock({
            stage: this.id,
            role: "instructions",
            x: x + 100,
            y: y + 110,
            lines: ["Click both buttons at the same time.", "Both of them. At the same time."],
            fontSize: 40,
            color: XP.titleNavy,
        });
        this.first = pushButton({
            stage: this.id,
            role: "button-left",
            x: x + 170,
            y: y + 400,
            width: 320,
            height: 120,
            label: "Click me",
            face: XP.taskbarBlue,
            edge: XP.titleNavy,
            textColor: XP.white,
        });
        this.second = pushButton({
            stage: this.id,
            role: "button-right",
            x: x + width - 500,
            y: y + 640,
            width: 320,
            height: 120,
            label: "Click me too",
            face: XP.goldfish,
            edge: "#b35a00",
            textColor: XP.white,
        });
        const elements = [
            ...window.elements,
            ...instructions,
            ...this.first.elements,
            ...this.second.elements,
        ];
        this.owned = elements.map((e) => e.drawdyElementId);
        this.required = [...this.first.ids, ...this.second.ids, ...instructions.map((e) => e.drawdyElementId)];
        await addElements(elements);
        await updateElements(window.ids.map((id) => ({ drawdyElementId: id, properties: { locked: true } })));
    }

    requiredIds(): Iterable<string> {
        return this.required;
    }

    ownedIds(): Iterable<string> {
        return this.owned;
    }

    private buttonIds(): Set<string> {
        return new Set([...(this.first?.ids ?? []), ...(this.second?.ids ?? [])]);
    }

    handle(event: DriverSubscriptionEvent): void {
        if (this.solved || !this.first || !this.second) return;
        switch (event.type) {
            case "subscription:scene:click":
                this.onClick(event.body.drawdyElementIds);
                return;
            case "subscription:scene:drawdy-elements-dragged":
                if (event.body.type === "dragEnd") this.scheduleCheck();
                return;
            case "subscription:scene:elements-updated": {
                const ids = this.buttonIds();
                if (event.body.drawdyElements.some((e) => ids.has(e.id))) this.scheduleCheck();
                return;
            }
        }
    }

    private onClick(clicked: readonly string[]): void {
        const first = this.first!;
        const second = this.second!;
        const hitFirst = clicked.some((id) => first.ids.includes(id));
        const hitSecond = clicked.some((id) => second.ids.includes(id));
        if (!hitFirst && !hitSecond) return;
        if (hitFirst && hitSecond) {
            this.scheduleCheck();
            return;
        }
        const face = hitFirst ? first.faceId : second.faceId;
        void restartAnimation([{ drawdyElementId: face, localAnimation: pressAnimation() }]);
        this.env.toast(ONE_BUTTON_REPLIES[Math.min(this.presses, ONE_BUTTON_REPLIES.length - 1)], "bad");
        this.presses++;
    }

    private scheduleCheck(): void {
        if (this.checkTimer) clearTimeout(this.checkTimer);
        this.checkTimer = setTimeout(() => {
            this.checkTimer = null;
            void this.checkOverlap();
        }, CHECK_DEBOUNCE_MS);
    }

    private async checkOverlap(): Promise<void> {
        if (this.solved || !this.first || !this.second || !this.env.isCurrent()) return;
        const rects = await elementRects([this.first.faceId, this.second.faceId]);
        const a = rects.get(this.first.faceId);
        const b = rects.get(this.second.faceId);
        if (!a || !b || overlapRatio(a, b) < REQUIRED_OVERLAP) return;
        this.solved = true;
        await restartAnimation(
            [this.first.faceId, this.second.faceId].map((id) => ({ drawdyElementId: id, localAnimation: pressAnimation() }))
        );
        this.env.toast("Both buttons are pressed at the same time.", "good");
        this.env.complete({ lines: ["Two buttons, one click.", "Technically correct. The best kind of correct."] });
    }

    async dispose(): Promise<void> {
        if (this.checkTimer) clearTimeout(this.checkTimer);
        this.checkTimer = null;
    }
}
