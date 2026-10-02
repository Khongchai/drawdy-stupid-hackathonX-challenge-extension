import type { CollaborationUserPresence, DrawdyElementSchema, DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { CHALLENGE_COUNT } from "../challenges";
import { Point } from "../geometry";
import { newId } from "../host";
import { lookUpSelf } from "../player";
import { looksSignedUp } from "../sign-up";
import { between, pick, seededRandom } from "../random";
import { addElements, updateElements } from "../scene";
import { roundButton, tag, textBlock, textLine } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { BUTTON, DECOY_COLORS, XP } from "../theme";
import { currentTheme } from "../ink";

const CONFETTI_COUNT = 140;
const AVATAR_SIZE = 150;
const AVATAR_RING = 12;

function playerCard(user: CollaborationUserPresence, center: Point): DrawdyElementSchema[] {
    const ringSize = AVATAR_SIZE + AVATAR_RING * 2;
    const ring: DrawdyElementSchema = {
        type: "shape",
        componentType: "circle",
        drawdyElementId: newId(),
        x: center.x - ringSize / 2,
        y: center.y - ringSize / 2,
        width: ringSize,
        height: ringSize,
        strokeColor: user.color,
        fillColor: user.color,
        strokeWidth: 2,
        roughness: 0,
        fillStyle: "solid",
        text: user.image ? undefined : user.name.trim().charAt(0).toUpperCase(),
        fontSize: 72,
        textColor: XP.white,
        meta: tag("finale", "player-ring"),
    };
    const avatar: DrawdyElementSchema[] = user.image
        ? [
              {
                  type: "image",
                  drawdyElementId: newId(),
                  x: center.x - AVATAR_SIZE / 2,
                  y: center.y - AVATAR_SIZE / 2,
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  url: user.image,
                  meta: tag("finale", "player-avatar"),
              },
          ]
        : [];
    const textX = center.x + ringSize / 2 + 36;
    return [
        ring,
        ...avatar,
        textLine({ stage: "finale", role: "player-name", x: textX, y: center.y - 64, text: user.name, fontSize: 52, ink: "title" }),
        textLine({
            stage: "finale",
            role: "player-status",
            x: textX + 2,
            y: center.y + 16,
            text: looksSignedUp(user) ? "Signed in to Drawdy" : "Guest",
            fontSize: 28,
            ink: "accent",
        }),
    ];
}

export class FinaleStage implements Stage {
    readonly id = "finale" as const;
    private owned: string[] = [];
    private required: string[] = [];
    private againIds = new Set<string>();

    constructor(private readonly env: StageEnv) {}

    async build(): Promise<void> {
        const { x, y, width, height } = this.env.region;
        const random = seededRandom(Date.now());
        const colors = DECOY_COLORS[currentTheme()];
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
                strokeColor: pick(random, colors),
                fillColor: pick(random, colors),
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
            y: y + 190,
            text: "You beat Drawdy's\nStupid Hackathon Challenge!",
            fontSize: 84,
            ink: "title",
        });
        const lines = textBlock({
            stage: this.id,
            role: "subtitle",
            x: x + 124,
            y: y + 470,
            lines: [`All ${CHALLENGE_COUNT} challenges done.`, "See you at Cleverse, 13th floor, 10-11 October 2026."],
            fontSize: 34,
            ink: "accent",
        });
        const again = roundButton({
            stage: this.id,
            role: "play-again",
            center: { x: x + width - 220, y: y + height - 200 },
            radius: 90,
            label: "Again",
            face: BUTTON.orange.face,
            edge: BUTTON.orange.edge,
        });
        this.againIds = new Set(again.ids);
        const self = await lookUpSelf();
        const card = self.kind === "found" ? playerCard(self.user, { x: x + 210, y: y + 720 }) : [];
        const elements = [...confetti, title, ...lines, ...card, ...again.elements];
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
        this.env.toast(self.kind === "found" ? `You won, ${self.user.name}.` : "You won.", "good", 5000);
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
