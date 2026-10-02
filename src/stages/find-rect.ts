import type { DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { challengeTitle } from "../challenges";
import { DecoyKind, decoyGrid, generateDecoys } from "../decoys";
import { FALL_MAX_MS, fallAnimation } from "../fall";
import { newId } from "../host";
import { currentTheme } from "../ink";
import { seededRandom } from "../random";
import { addElements, countElements, elementRects, flyTo, playThenRemove } from "../scene";
import { rectCenter } from "../geometry";
import { textLine } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { DECOY_COLORS } from "../theme";
import { looksLikeUprightRectangle } from "../rectangle-check";
import { subscribe, unsubscribe } from "../host";

const DECOY_COUNT = 9900;
const BOARD_ELEMENT_LIMIT = 10_000;
const RESERVED_ELEMENTS = 60;
const CLICK_TOAST_COOLDOWN_MS = 1500;
const HINT_AFTER_MS = 60_000;
const DECOY_SPACING = 72;
const FIELD_ASPECT = 1.6;
const FIELD_PADDING = 160;
const TITLE_BAND = 520;
const GRID = decoyGrid(DECOY_COUNT, DECOY_SPACING, FIELD_ASPECT);
const FOCUS_SIZE = { width: 1600, height: 1000 };

export const FIND_RECT_REGION = {
    width: GRID.width + FIELD_PADDING * 2,
    height: GRID.height + TITLE_BAND + FIELD_PADDING,
};

export class FindRectStage implements Stage {
    readonly id = "find-rect" as const;
    private owned = new Set<string>();
    private required: string[] = [];
    private decoyKinds = new Map<string, DecoyKind>();
    private drawnRects = new Set<string>();
    private solved = false;
    private lastClickToastAt = 0;
    private hintTimer: ReturnType<typeof setTimeout> | null = null;
    private turnedDiamonds = new Set<string>();
    private updatesSubscription: string | null = null;

    constructor(private readonly env: StageEnv) {}

    async build(): Promise<void> {
        const { x, y, width } = this.env.region;
        const title = textLine({
            stage: this.id,
            role: "title",
            x: x + FIELD_PADDING,
            y: y + 140,
            text: `${challengeTitle(this.id)}: Find the rectangle and click it.`,
            fontSize: Math.round(46 * (width / FOCUS_SIZE.width)),
            ink: "title",
        });
        const room = BOARD_ELEMENT_LIMIT - RESERVED_ELEMENTS - (await countElements());
        const count = Math.max(0, Math.min(DECOY_COUNT, room));
        const decoys = generateDecoys(
            count,
            { x: x + FIELD_PADDING, y: y + TITLE_BAND },
            GRID,
            seededRandom(Date.now()),
            this.id,
            newId,
            DECOY_COLORS[currentTheme()]
        );
        for (const d of decoys) this.decoyKinds.set(d.element.drawdyElementId, d.kind);
        for (const e of [title, ...decoys.map((d) => d.element)]) this.owned.add(e.drawdyElementId);
        this.required = [title.drawdyElementId];
        await addElements([title]);
        const total = count.toLocaleString("en-US");
        this.env.toast(`Adding ${total} shapes...`, "info", 10_000);
        await addElements(
            decoys.map((d) => d.element),
            (added) => this.env.toast(`Adding shapes: ${added.toLocaleString("en-US")} / ${total}`, "info", 10_000)
        );
        if (count < DECOY_COUNT) {
            this.env.toast(`This board is almost full, so only ${total} shapes fit.`, "info", 6000);
        } else {
            this.env.toast("Find the rectangle.", "info");
        }
        this.hintTimer = setTimeout(() => {
            if (!this.solved && this.env.isCurrent()) this.env.toast("Hint: you can draw one.", "info", 6000);
        }, HINT_AFTER_MS);
        this.updatesSubscription = await subscribe({
            type: "subscription:scene:elements-updated",
            req: { properties: ["points"] },
        });
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
            for (const e of event.body.drawdyElements) {
                if (!this.owned.has(e.id) && e.componentType === "rect") this.drawnRects.add(e.id);
            }
            return;
        }
        if (event.type === "subscription:scene:elements-updated") {
            this.onUpdated(event.body.drawdyElements);
            return;
        }
        if (event.type === "subscription:scene:click") {
            const clickedRect = event.body.drawdyElementIds.find((id) => this.drawnRects.has(id) || this.turnedDiamonds.has(id));
            if (clickedRect) this.solve(clickedRect);
            else this.onClick(event.body.drawdyElementIds, event.body.cursor.canvasSpace);
        }
    }

    private onUpdated(elements: readonly { id: string; points?: [number, number][] }[]): void {
        for (const element of elements) {
            if (this.decoyKinds.get(element.id) !== "diamond" || !element.points) continue;
            const isRectangle = looksLikeUprightRectangle(element.points);
            const wasRectangle = this.turnedDiamonds.has(element.id);
            if (isRectangle && !wasRectangle) {
                this.turnedDiamonds.add(element.id);
                this.env.toast("That's a rectangle now. Click it.", "good", 4000);
            } else if (!isRectangle && wasRectangle) {
                this.turnedDiamonds.delete(element.id);
            }
        }
    }

    private onClick(ids: readonly string[], at: { x: number; y: number }): void {
        const kind = ids.map((id) => this.decoyKinds.get(id)).find((k) => k !== undefined);
        if (!kind) return;
        const now = Date.now();
        if (now - this.lastClickToastAt < CLICK_TOAST_COOLDOWN_MS) return;
        this.lastClickToastAt = now;
        this.env.tantrum("not-rect", at);
    }

    private solve(rectId: string): void {
        this.solved = true;
        const turned = this.turnedDiamonds.has(rectId);
        this.owned.add(rectId);
        this.decoyKinds.delete(rectId);
        void unsubscribe(this.updatesSubscription);
        this.updatesSubscription = null;
        this.env.toast(turned ? "A diamond, turned 45 degrees. Sure. That counts." : "Found it.", "good", 4000);
        const decoyIds = [...this.decoyKinds.keys()];
        for (const id of decoyIds) this.owned.delete(id);
        this.decoyKinds.clear();
        const random = seededRandom(Date.now());
        const lines = turned ? ["Found the rectangle.", "It was a diamond a minute ago."] : ["Found the rectangle.", "You drew it."];
        void playThenRemove(decoyIds, () => fallAnimation(random), FALL_MAX_MS).then(() => this.focusOn(rectId, lines));
    }

    private async focusOn(rectId: string, lines: readonly string[]): Promise<void> {
        if (!this.env.isCurrent()) return;
        const drawn = (await elementRects([rectId])).get(rectId);
        const center = drawn ? rectCenter(drawn) : rectCenter(this.env.region);
        const focus = {
            x: center.x - FOCUS_SIZE.width / 2,
            y: center.y - FOCUS_SIZE.height / 2,
            ...FOCUS_SIZE,
        };
        await flyTo(focus);
        this.env.complete({
            lines,
            textAt: { x: focus.x + 80, y: focus.y + focus.height - 190 },
            goAt: { x: focus.x + focus.width - 150, y: focus.y + focus.height - 130 },
        });
    }

    async dispose(): Promise<void> {
        if (this.hintTimer) clearTimeout(this.hintTimer);
        this.hintTimer = null;
        await unsubscribe(this.updatesSubscription);
        this.updatesSubscription = null;
    }
}
