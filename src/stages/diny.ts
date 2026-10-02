import type { DrawdyElementSchema, DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { challengeTitle } from "../challenges";
import { chooseEscape, insetRect, randomPointIn } from "../flee";
import { Point, Rect, distance, distanceToSegment } from "../geometry";
import { newId, subscribe, trySend, unsubscribe } from "../host";
import { currentTheme } from "../ink";
import { beginPreview, endPreview, startPreviewLoop } from "../preview-loop";
import { seededRandom } from "../random";
import { addElements, updateElements } from "../scene";
import { tag, textLine } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { YARD } from "../theme";

const DINY_WIDTH = 181;
const DINY_HEIGHT = 161;
const DINY_CLOSED_URL = "https://cdn.drawdy.io/stupid-hackathonx/diny-mouth-close.png";
const DINY_OPEN_URL = "https://cdn.drawdy.io/stupid-hackathonx/diny-mouth-open.png";
const PARKED_OFFSET = 1_000_000;
const GIVE_UP_MS = 30_000;
const FLEE_SCREEN_PX = 240;
const FLEE_TAU_S = 0.045;
const WANDER_TAU_S = 0.9;
const FLEE_HOLD_MS = 450;
const MISS_COOLDOWN_MS = 4000;
const HEARTBREAK = "อกไก่ยังมีคนหมัก แต่อกหักต้องปล่อยเขาไปนะพี่นะ";

export class DinyStage implements Stage {
    readonly id = "diny" as const;
    private owned: string[] = [];
    private required: string[] = [];
    private closedId = "";
    private openId = "";
    private rest: Point = { x: 0, y: 0 };
    private position: Point = { x: 0, y: 0 };
    private target: Point = { x: 0, y: 0 };
    private roam: Rect = { x: 0, y: 0, width: 0, height: 0 };
    private zoom = 1;
    private fleeingUntil = 0;
    private lastFrameAt = 0;
    private nextWanderAt = 0;
    private random = seededRandom(Date.now());
    private outcome: "running" | "caught" | "released" = "running";
    private stopLoop: (() => void) | null = null;
    private giveUpTimer: ReturnType<typeof setTimeout> | null = null;
    private subscriptions: (string | null)[] = [];
    private previewing = false;
    private lastMissAt = 0;

    constructor(private readonly env: StageEnv) {}

    async build(): Promise<void> {
        const { x, y, width, height } = this.env.region;
        const yard: Rect = { x: x + 40, y: y + 150, width: width - 80, height: height - 190 };
        this.roam = insetRect(yard, Math.max(DINY_WIDTH, DINY_HEIGHT) / 2 + 12);
        this.rest = { x: yard.x + yard.width / 2, y: yard.y + yard.height / 2 };
        this.position = { ...this.rest };
        this.target = { ...this.rest };
        this.closedId = newId();
        this.openId = newId();
        const title = textLine({
            stage: this.id,
            role: "title",
            x: x + 40,
            y: y + 40,
            text: `${challengeTitle(this.id)}: Click Diny.`,
            fontSize: 46,
            ink: "title",
        });
        const fence: DrawdyElementSchema = {
            type: "shape",
            componentType: "rect",
            drawdyElementId: newId(),
            x: yard.x,
            y: yard.y,
            width: yard.width,
            height: yard.height,
            strokeColor: YARD[currentTheme()].stroke,
            fillColor: YARD[currentTheme()].fill,
            strokeWidth: 4,
            strokeDash: "dashed",
            cornerRadius: 28,
            roughness: 0,
            fillStyle: "solid",
            meta: tag(this.id, "yard"),
        };
        const dinyImage = (drawdyElementId: string, url: string, role: string): DrawdyElementSchema => ({
            type: "image",
            drawdyElementId,
            x: this.rest.x - DINY_WIDTH / 2,
            y: this.rest.y - DINY_HEIGHT / 2,
            width: DINY_WIDTH,
            height: DINY_HEIGHT,
            url,
            meta: tag(this.id, role),
        });
        const elements = [
            title,
            fence,
            dinyImage(this.openId, DINY_OPEN_URL, "diny-mouth-open"),
            dinyImage(this.closedId, DINY_CLOSED_URL, "diny-mouth-closed"),
        ];
        this.owned = elements.map((e) => e.drawdyElementId);
        this.required = [title.drawdyElementId, fence.drawdyElementId, this.closedId, this.openId];
        await addElements(elements);
        await updateElements(
            [fence.drawdyElementId, this.closedId, this.openId].map((id) => ({ drawdyElementId: id, properties: { locked: true } }))
        );
        const camera = await trySend({ type: "command:camera:get-info" });
        this.zoom = camera?.zoom ?? 1;
        this.subscriptions = [
            await subscribe({ type: "subscription:scene:pointer-position" }),
            await subscribe({ type: "subscription:scene:pointer", req: { elementIds: [this.closedId, this.openId] } }),
            await subscribe({ type: "subscription:camera:moved-debounced" }),
        ];
        const began = await beginPreview([this.closedId, this.openId]);
        this.previewing = began.has(this.closedId) && began.has(this.openId);
        if (!this.previewing) this.env.toast("Diny can't move. Sorry.", "bad");
        this.lastFrameAt = performance.now();
        this.stopLoop = startPreviewLoop((now) => this.frame(now));
        this.giveUpTimer = setTimeout(() => this.release(), GIVE_UP_MS);
        this.env.toast("Click Diny.");
    }

    requiredIds(): Iterable<string> {
        return this.required;
    }

    ownedIds(): Iterable<string> {
        return this.owned;
    }

    private fleeRadius(): number {
        return FLEE_SCREEN_PX / Math.max(this.zoom, 0.05);
    }

    private frame(now: number) {
        const dt = Math.min(0.1, (now - this.lastFrameAt) / 1000);
        this.lastFrameAt = now;
        const fleeing = now < this.fleeingUntil && this.outcome !== "caught";
        if (!fleeing && now > this.nextWanderAt && this.outcome !== "caught") {
            this.target = randomPointIn(this.roam, this.random);
            this.nextWanderAt = now + 1800 + this.random() * 2200;
        }
        const tau = fleeing ? FLEE_TAU_S : WANDER_TAU_S;
        const blend = 1 - Math.exp(-dt / tau);
        this.position = {
            x: this.position.x + (this.target.x - this.position.x) * blend,
            y: this.position.y + (this.target.y - this.position.y) * blend,
        };
        if (!this.previewing) return [];
        const sway = this.outcome === "caught" ? now * 0.012 : 0.14 * Math.sin(now * 0.005);
        const mouthOpen = fleeing || this.outcome === "caught";
        const here = { x: this.position.x - this.rest.x, y: this.position.y - this.rest.y, scale: 1, rotation: sway };
        const parked = { x: PARKED_OFFSET, y: PARKED_OFFSET, scale: 1, rotation: 0 };
        return [
            { drawdyElementId: this.openId, transform: mouthOpen ? here : parked },
            { drawdyElementId: this.closedId, transform: mouthOpen ? parked : here },
        ];
    }

    private onCursor(cursor: Point): void {
        if (this.outcome === "caught") return;
        const radius = this.fleeRadius();
        const threatened =
            distance(cursor, this.position) < radius ||
            distance(cursor, this.target) < radius ||
            distanceToSegment(cursor, { a: this.position, b: this.target }) < radius * 0.8;
        if (!threatened) return;
        this.target = chooseEscape(this.position, cursor, this.roam, radius, this.random);
        const now = Date.now();
        if (this.outcome === "running" && now - this.lastMissAt > MISS_COOLDOWN_MS) {
            this.lastMissAt = now;
            this.env.tantrum("diny-miss", cursor);
        }
        this.fleeingUntil = performance.now() + FLEE_HOLD_MS;
        this.nextWanderAt = this.fleeingUntil + 1200;
    }

    handle(event: DriverSubscriptionEvent): void {
        switch (event.type) {
            case "subscription:scene:pointer-position":
                this.onCursor(event.body.position.canvasSpace);
                return;
            case "subscription:camera:moved-debounced":
                this.zoom = event.body.zoom;
                return;
            case "subscription:scene:pointer":
                if (event.body.type === "down" && this.isDiny(event.body.drawdyElementIds)) this.catch();
                return;
            case "subscription:scene:click":
                if (this.isDiny(event.body.drawdyElementIds)) this.catch();
                return;
        }
    }

    private isDiny(ids: readonly string[]): boolean {
        return ids.includes(this.closedId) || ids.includes(this.openId);
    }

    private catch(): void {
        if (this.outcome === "caught") return;
        const wasReleased = this.outcome === "released";
        this.outcome = "caught";
        this.target = { ...this.position };
        if (this.giveUpTimer) clearTimeout(this.giveUpTimer);
        this.env.toast("You caught Diny.", "good", 5000);
        if (!wasReleased) this.env.complete({ lines: ["You caught Diny."] });
    }

    private release(): void {
        if (this.outcome !== "running" || !this.env.isCurrent()) return;
        this.outcome = "released";
        const { x, y, height } = this.env.region;
        const line = textLine({
            stage: this.id,
            role: "heartbreak",
            x: x + 80,
            y: y + height - 300,
            text: HEARTBREAK,
            fontSize: 44,
            ink: "danger",
        });
        this.owned.push(line.drawdyElementId);
        void addElements([line]).then(() => {
            this.env.toast(HEARTBREAK, "info", 8000);
            this.env.complete({ lines: ["You didn't catch Diny. Let her go."] });
        });
    }

    async dispose(): Promise<void> {
        this.stopLoop?.();
        this.stopLoop = null;
        if (this.giveUpTimer) clearTimeout(this.giveUpTimer);
        for (const id of this.subscriptions) await unsubscribe(id);
        this.subscriptions = [];
        if (this.previewing) await endPreview();
        this.previewing = false;
    }
}
