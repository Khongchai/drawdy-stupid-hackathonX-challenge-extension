import type { DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { DecoyKind, generateDecoys } from "../decoys";
import { newId } from "../host";
import { seededRandom } from "../random";
import { addElements, animateOutAndRemove, countElements } from "../scene";
import { textLine } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { XP } from "../theme";

const DECOY_COUNT = 8000;
const BOARD_ELEMENT_LIMIT = 10_000;
const RESERVED_ELEMENTS = 60;
const CLICK_TOAST_COOLDOWN_MS = 1500;
const HINTS: readonly (readonly [number, string])[] = [
    [40_000, "Hint: nobody said the rectangle already exists."],
    [80_000, "Hint: look at your toolbar."],
];

const KIND_NAMES: Record<DecoyKind, string> = {
    circle: "a circle",
    diamond: "a diamond",
    line: "a line",
    arrow: "an arrow",
    squiggle: "a squiggle",
    glyph: "a text character",
    "box-glyph": "a text character that looks like a rectangle. It is not a rectangle",
};

export class FindRectStage implements Stage {
    readonly id = "find-rect" as const;
    private owned = new Set<string>();
    private required: string[] = [];
    private decoyKinds = new Map<string, DecoyKind>();
    private solved = false;
    private lastClickToastAt = 0;
    private hintTimers: ReturnType<typeof setTimeout>[] = [];

    constructor(private readonly env: StageEnv) {}

    async build(): Promise<void> {
        const { x, y, width, height } = this.env.region;
        const title = [
            textLine({
                stage: this.id,
                role: "title",
                x: x + 40,
                y: y + 20,
                text: "Challenge 2 of 4 - Find the rectangle and click on it.",
                fontSize: 46,
                color: this.env.error ? XP.closeRed : XP.titleNavy,
            }),
            textLine({
                stage: this.id,
                role: "subtitle",
                x: x + 40,
                y: y + 88,
                text: "There are 8,000 things in here. One of them is a rectangle. Probably.",
                fontSize: 26,
                color: XP.taskbarBlue,
            }),
        ];
        const room = BOARD_ELEMENT_LIMIT - RESERVED_ELEMENTS - (await countElements());
        const count = Math.max(0, Math.min(DECOY_COUNT, room));
        const decoys = generateDecoys(
            count,
            { x: x + 20, y: y + 150, width: width - 60, height: height - 190 },
            seededRandom(Date.now()),
            this.id,
            newId
        );
        for (const d of decoys) this.decoyKinds.set(d.element.drawdyElementId, d.kind);
        const elements = [...title, ...decoys.map((d) => d.element)];
        for (const e of elements) this.owned.add(e.drawdyElementId);
        this.required = title.map((e) => e.drawdyElementId);
        await addElements(title);
        const total = count.toLocaleString("en-US");
        this.env.toast(`Spawning ${total} shapes...`, "info", 10_000);
        await addElements(
            decoys.map((d) => d.element),
            (added) => this.env.toast(`Spawning shapes: ${added.toLocaleString("en-US")} / ${total}`, "info", 10_000)
        );
        if (count < DECOY_COUNT) {
            this.env.toast(
                `This board is close to the ${BOARD_ELEMENT_LIMIT.toLocaleString("en-US")} element limit, so only ${total} shapes fit. Find the rectangle and click on it.`,
                "info",
                7000
            );
        } else {
            this.env.toast("Find the rectangle and click on it.", "info");
        }
        this.hintTimers = HINTS.map(([delay, text]) =>
            setTimeout(() => {
                if (!this.solved && this.env.isCurrent()) this.env.toast(text, "info", 6000);
            }, delay)
        );
    }

    requiredIds(): Iterable<string> {
        return this.required;
    }

    ownedIds(): Iterable<string> {
        return this.owned;
    }

    handle(event: DriverSubscriptionEvent): void {
        if (this.solved) return;
        if (event.type === "subscription:scene:elements-added") {
            const drawn = event.body.drawdyElements.find(
                (e) => !this.owned.has(e.id) && e.componentType === "rect"
            );
            if (drawn) this.solve(drawn.id);
            return;
        }
        if (event.type === "subscription:scene:click") this.onClick(event.body.drawdyElementIds);
    }

    private onClick(ids: readonly string[]): void {
        const kind = ids.map((id) => this.decoyKinds.get(id)).find((k) => k !== undefined);
        if (!kind) return;
        const now = Date.now();
        if (now - this.lastClickToastAt < CLICK_TOAST_COOLDOWN_MS) return;
        this.lastClickToastAt = now;
        this.env.toast(`That is ${KIND_NAMES[kind]}. Keep looking.`, "bad");
    }

    private solve(rectId: string): void {
        this.solved = true;
        this.owned.add(rectId);
        this.env.toast("You found it. You also made it, but that counts.", "good", 5000);
        const decoyIds = [...this.decoyKinds.keys()];
        for (const id of decoyIds) this.owned.delete(id);
        this.decoyKinds.clear();
        void animateOutAndRemove(decoyIds, 900).then(() =>
            this.env.complete({ lines: ["Found the rectangle.", "It was the one you drew."] })
        );
    }

    async dispose(): Promise<void> {
        for (const timer of this.hintTimers) clearTimeout(timer);
        this.hintTimers = [];
    }
}
