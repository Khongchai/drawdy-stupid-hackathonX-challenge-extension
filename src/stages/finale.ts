import type { DrawdyElementSchema, DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { newId } from "../host";
import { between, pick, seededRandom } from "../random";
import { addElements, updateElements } from "../scene";
import { roundButton, tag, textBlock, textLine } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { DECOY_COLORS, XP } from "../theme";

const CONFETTI_COUNT = 140;

export class FinaleStage implements Stage {
    readonly id = "finale" as const;
    private owned: string[] = [];
    private required: string[] = [];
    private againIds = new Set<string>();

    constructor(private readonly env: StageEnv) {}

    async build(): Promise<void> {
        const { x, y, width, height } = this.env.region;
        const random = seededRandom(Date.now());
        const confetti: DrawdyElementSchema[] = Array.from({ length: CONFETTI_COUNT }, () => {
            const size = between(random, 12, 34);
            return {
                type: "shape",
                componentType: random() < 0.5 ? "circle" : "diamond",
                drawdyElementId: newId(),
                x: between(random, x, x + width),
                y: between(random, y, y + height),
                width: size,
                height: size,
                strokeColor: pick(random, DECOY_COLORS),
                fillColor: pick(random, DECOY_COLORS),
                strokeWidth: 2,
                roughness: 0,
                fillStyle: "solid",
                meta: tag(this.id, "confetti"),
            } satisfies DrawdyElementSchema;
        });
        const title = textLine({
            stage: this.id,
            role: "title",
            x: x + 120,
            y: y + 260,
            text: "You beat Stupid Hackathon X.",
            fontSize: 84,
            color: XP.titleNavy,
        });
        const lines = textBlock({
            stage: this.id,
            role: "subtitle",
            x: x + 124,
            y: y + 400,
            lines: [
                "Four challenges, zero business value. Well done.",
                "See you at Cleverse, 13th floor, 10-11 October 2026.",
            ],
            fontSize: 34,
            color: XP.taskbarBlue,
        });
        const again = roundButton({
            stage: this.id,
            role: "play-again",
            center: { x: x + width - 220, y: y + height - 200 },
            radius: 90,
            label: "Again",
            face: XP.goldfish,
            edge: "#b35a00",
        });
        this.againIds = new Set(again.ids);
        const elements = [...confetti, title, ...lines, ...again.elements];
        this.owned = elements.map((e) => e.drawdyElementId);
        this.required = [title.drawdyElementId, ...again.ids];
        await addElements(elements);
        await updateElements(
            confetti.map((c) => ({
                drawdyElementId: c.drawdyElementId,
                properties: {
                    localAnimation: {
                        time: {
                            durationMs: Math.round(between(random, 1400, 3200)),
                            curve: "ease-in-out",
                            repeat: "ping-pong",
                        },
                        animation: {
                            transform: {
                                y: [0, between(random, -60, 60)],
                                x: [0, between(random, -40, 40)],
                                rotation: [0, between(random, -3, 3)],
                            },
                            curve: "linear",
                        },
                    },
                },
            }))
        );
        this.env.toast("All four challenges done.", "good", 5000);
    }

    requiredIds(): Iterable<string> {
        return this.required;
    }

    ownedIds(): Iterable<string> {
        return this.owned;
    }

    handle(event: DriverSubscriptionEvent): void {
        if (event.type !== "subscription:scene:click") return;
        if (event.body.drawdyElementIds.some((id) => this.againIds.has(id))) this.env.restart();
    }

    async dispose(): Promise<void> {}
}
