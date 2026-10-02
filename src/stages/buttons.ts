import type { DriverSubscriptionEvent, LocalAnimation } from "@drawdy/driver-protocol";
import { challengeTitle } from "../challenges";
import { Point, distance } from "../geometry";
import { subscribe, unsubscribe } from "../host";
import { addElements, restartAnimation, updateElements } from "../scene";
import { PushButton, pushButton, textLine, xpWindow } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { BUTTON, PANEL_INK, XP } from "../theme";

const DRAG_SLOP_PX = 6;

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
    private pressedAt: Point | null = null;
    private solved = false;
    private subscriptions: (string | null)[] = [];

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
            title: challengeTitle(this.id),
        });
        const instructions = textLine({
            stage: this.id,
            role: "instructions",
            x: x + 100,
            y: y + 120,
            text: "Click both buttons at the same time.",
            fontSize: 44,
            color: PANEL_INK.title,
        });
        this.first = pushButton({
            stage: this.id,
            role: "button-left",
            x: x + 170,
            y: y + 400,
            width: 320,
            height: 120,
            label: "Button 1",
            face: BUTTON.blue.face,
            edge: BUTTON.blue.edge,
            textColor: XP.white,
        });
        this.second = pushButton({
            stage: this.id,
            role: "button-right",
            x: x + width - 500,
            y: y + 640,
            width: 320,
            height: 120,
            label: "Button 2",
            face: BUTTON.orange.face,
            edge: BUTTON.orange.edge,
            textColor: XP.white,
        });
        const elements = [...window.elements, instructions, ...this.first.elements, ...this.second.elements];
        this.owned = elements.map((e) => e.drawdyElementId);
        this.required = [...this.first.ids, ...this.second.ids, instructions.drawdyElementId];
        await addElements(elements);
        await updateElements(window.ids.map((id) => ({ drawdyElementId: id, properties: { locked: true } })));
        this.subscriptions = [
            await subscribe({
                type: "subscription:scene:pointer",
                req: { elementIds: [...this.first.ids, ...this.second.ids] },
            }),
        ];
    }

    requiredIds(): Iterable<string> {
        return this.required;
    }

    ownedIds(): Iterable<string> {
        return this.owned;
    }

    handle(event: DriverSubscriptionEvent): void {
        if (this.solved || !this.first || !this.second) return;
        if (event.type === "subscription:scene:pointer" && event.body.type === "down") {
            this.pressedAt = event.body.cursor.domSpace;
            return;
        }
        if (event.type === "subscription:scene:click") {
            const releasedAt = event.body.cursor.domSpace;
            const pressedAt = this.pressedAt;
            this.pressedAt = null;
            if (pressedAt && distance(pressedAt, releasedAt) > DRAG_SLOP_PX) return;
            this.onClick(event.body.drawdyElementIds, event.body.cursor.canvasSpace);
        }
    }

    private onClick(clicked: readonly string[], at: Point): void {
        const first = this.first!;
        const second = this.second!;
        const hitFirst = clicked.some((id) => first.ids.includes(id));
        const hitSecond = clicked.some((id) => second.ids.includes(id));
        if (!hitFirst && !hitSecond) return;
        if (hitFirst && hitSecond) {
            void this.solve();
            return;
        }
        const face = hitFirst ? first.faceId : second.faceId;
        void restartAnimation([{ drawdyElementId: face, localAnimation: pressAnimation() }]);
        this.env.tantrum("one-button", at);
    }

    private async solve(): Promise<void> {
        this.solved = true;
        await restartAnimation(
            [this.first!.faceId, this.second!.faceId].map((id) => ({ drawdyElementId: id, localAnimation: pressAnimation() }))
        );
        this.env.toast("Both buttons at the same time. Nobody said they had to stay where they were.", "good", 5000);
        this.env.complete({ lines: ["Two buttons, one click.", "Technically correct. The best kind of correct."], onPanel: true });
    }

    async dispose(): Promise<void> {
        for (const id of this.subscriptions) await unsubscribe(id);
        this.subscriptions = [];
    }
}
