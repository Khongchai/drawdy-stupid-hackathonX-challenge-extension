import type { DrawdyElementSchema, DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { CHALLENGE_COUNT } from "../challenges";
import { addElements } from "../scene";
import { pushButton, textBlock, textLine, xpWindow } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { BUTTON, PANEL_INK, XP } from "../theme";

const EVENT_FACTS: readonly (readonly [string, string])[] = [
    ["WHEN", "10-11 October 2026, Saturday to Sunday, overnight"],
    ["WHERE", "Cleverse Office, 13th floor, Rungrojthanakul (Unicity) Building"],
    ["", "44/1 Ratchadaphisek Rd, Huai Khwang, Bangkok. MRT Phra Ram 9, exit 2"],
    ["WHO", "Creatorsgarten x StupidHackTH, every year since 2017"],
    ["WHAT", "two days building things nobody needs"],
    ["COST", "free, non-commercial, no business value allowed"],
];

export class IntroStage implements Stage {
    readonly id = "intro" as const;
    private owned: string[] = [];
    private required: string[] = [];
    private yesIds = new Set<string>();
    private noIds = new Set<string>();

    constructor(private readonly env: StageEnv) {}

    async build(): Promise<void> {
        const { x, y } = this.env.region;
        const left = x + 120;
        const top = y + 60;
        const window = xpWindow({
            stage: this.id,
            role: "notepad",
            x: left,
            y: top,
            width: 1360,
            height: 860,
            title: "welcome.txt - Notepad",
            anchor: this.env.anchor,
        });
        const elements: DrawdyElementSchema[] = [...window.elements];
        elements.push(
            textLine({
                stage: this.id,
                role: "menu",
                x: left + 24,
                y: top + 58,
                text: "File      Edit      Search      Help",
                fontSize: 18,
                color: XP.ink,
            })
        );
        let cursor = top + 110;
        if (this.env.error) {
            elements.push(
                textLine({
                    stage: this.id,
                    role: "error",
                    x: left + 40,
                    y: cursor,
                    text: `ERROR  ${this.env.error}`,
                    fontSize: 24,
                    color: PANEL_INK.danger,
                })
            );
            cursor += 56;
        }
        elements.push(
            textLine({
                stage: this.id,
                role: "headline",
                x: left + 40,
                y: cursor,
                text: "STUPID HACKATHON X",
                fontSize: 56,
                color: PANEL_INK.title,
            }),
            textLine({
                stage: this.id,
                role: "subtitle",
                x: left + 40,
                y: cursor + 76,
                text: "The 10th Stupid Hackathon in Thailand. No business value allowed.",
                fontSize: 24,
                color: PANEL_INK.accent,
            })
        );
        cursor += 140;
        EVENT_FACTS.forEach(([label, value], i) => {
            const rowY = cursor + i * 40;
            if (label) {
                elements.push(
                    textLine({ stage: this.id, role: "fact-label", x: left + 40, y: rowY, text: label, fontSize: 24, color: PANEL_INK.success })
                );
            }
            elements.push(
                textLine({ stage: this.id, role: "fact", x: left + 190, y: rowY, text: value, fontSize: 24, color: PANEL_INK.body })
            );
        });
        cursor += EVENT_FACTS.length * 40 + 40;
        elements.push(
            ...textBlock({
                stage: this.id,
                role: "rules",
                x: left + 40,
                y: cursor,
                lines: [`${CHALLENGE_COUNT} challenges. All of them are stupid.`, "Delete something a challenge needs and you start over."],
                fontSize: 24,
                color: PANEL_INK.body,
            })
        );
        const askY = top + 860 - 170;
        elements.push(
            textLine({
                stage: this.id,
                role: "ask",
                x: left + 40,
                y: askY + 30,
                text: "R u ready ?",
                fontSize: 52,
                color: PANEL_INK.title,
            })
        );
        const yes = pushButton({
            stage: this.id,
            role: "yes-button",
            x: left + 760,
            y: askY + 20,
            width: 240,
            height: 92,
            label: "Yes",
            face: BUTTON.go.face,
            edge: BUTTON.go.edge,
            textColor: XP.white,
            fontSize: 32,
        });
        const no = pushButton({
            stage: this.id,
            role: "no-button",
            x: left + 1040,
            y: askY + 20,
            width: 240,
            height: 92,
            label: "No",
            face: BUTTON.grey.face,
            edge: BUTTON.grey.edge,
            textColor: XP.ink,
            fontSize: 32,
        });
        elements.push(...yes.elements, ...no.elements);
        this.yesIds = new Set(yes.ids);
        this.noIds = new Set(no.ids);
        this.owned = elements.map((e) => e.drawdyElementId);
        this.required = [...window.ids, ...yes.ids];
        await addElements(elements);
        if (!this.env.error) this.env.toast("Click Yes to start.");
    }

    requiredIds(): Iterable<string> {
        return this.required;
    }

    ownedIds(): Iterable<string> {
        return this.owned;
    }

    handle(event: DriverSubscriptionEvent): void {
        if (event.type !== "subscription:scene:click") return;
        const ids = event.body.drawdyElementIds;
        if (ids.some((id) => this.yesIds.has(id))) {
            this.env.advance();
            return;
        }
        if (ids.some((id) => this.noIds.has(id))) {
            this.env.tantrum("no-button", event.body.cursor.canvasSpace);
        }
    }

    async dispose(): Promise<void> {}
}
