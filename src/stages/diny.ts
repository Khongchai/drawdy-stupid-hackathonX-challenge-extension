import type { DrawdyElementSchema, DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { DINY_BASE64, DINY_MIME } from "../assets/diny";
import { chooseEscape, insetRect, randomPointIn } from "../flee";
import { Point, Rect, distance, distanceToSegment } from "../geometry";
import { newId, subscribe, trySend, unsubscribe } from "../host";
import { beginPreview, endPreview, startPreviewLoop } from "../preview-loop";
import { seededRandom } from "../random";
import { addElements, updateElements } from "../scene";
import { tag, textLine } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { XP } from "../theme";

const DINY_SIZE = 150;
const GIVE_UP_MS = 30_000;
const FLEE_SCREEN_PX = 240;
const FLEE_TAU_S = 0.045;
const WANDER_TAU_S = 0.9;
const FLEE_HOLD_MS = 450;
const HEARTBREAK = "อกไก่ยังมีคนหมัก แต่อกหักต้องปล่อยเขาไปนะพี่นะ";

function dinyBlob(): Blob {
    const binary = atob(DINY_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: DINY_MIME });
}

export class DinyStage implements Stage {
    readonly id = "diny" as const;
    private owned: string[] = [];
    private required: string[] = [];
    private dinyId = "";
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

    constructor(private readonly env: StageEnv) {}

    async build(): Promise<void> {
        const { x, y, width, height } = this.env.region;
        const yard: Rect = { x: x + 40, y: y + 150, width: width - 80, height: height - 190 };
        this.roam = insetRect(yard, DINY_SIZE / 2 + 12);
        this.rest = { x: yard.x + yard.width / 2, y: yard.y + yard.height / 2 };
        this.position = { ...this.rest };
        this.target = { ...this.rest };
        this.dinyId = newId();
        const title = textLine({
            stage: this.id,
            role: "title",
            x: x + 40,
            y: y + 20,
            text: "Challenge 3 of 4 - Click on Diny.",
            fontSize: 46,
            color: XP.titleNavy,
        });
        const subtitle = textLine({
            stage: this.id,
            role: "subtitle",
            x: x + 40,
            y: y + 88,
            text: "She is shy. She does not like your cursor.",
            fontSize: 26,
            color: XP.taskbarBlue,
        });
        const fence: DrawdyElementSchema = {
            type: "shape",
            componentType: "rect",
            drawdyElementId: newId(),
            x: yard.x,
            y: yard.y,
            width: yard.width,
            height: yard.height,
            strokeColor: XP.blissGreen,
            fillColor: XP.paleSky,
            strokeWidth: 4,
            strokeDash: "dashed",
            cornerRadius: 28,
            roughness: 0,
            fillStyle: "solid",
            meta: tag(this.id, "yard"),
        };
        const diny: DrawdyElementSchema = {
            type: "image",
            drawdyElementId: this.dinyId,
            x: this.rest.x - DINY_SIZE / 2,
            y: this.rest.y - DINY_SIZE / 2,
            width: DINY_SIZE,
            height: DINY_SIZE,
            blob: dinyBlob(),
            meta: tag(this.id, "diny"),
        };
        const elements = [title, subtitle, fence, diny];
        this.owned = elements.map((e) => e.drawdyElementId);
        this.required = [title.drawdyElementId, fence.drawdyElementId, this.dinyId];
        await addElements(elements);
        await updateElements(
            [fence.drawdyElementId, this.dinyId].map((id) => ({ drawdyElementId: id, properties: { locked: true } }))
        );
        const camera = await trySend({ type: "command:camera:get-info" });
        this.zoom = camera?.zoom ?? 1;
        this.subscriptions = [
            await subscribe({ type: "subscription:scene:pointer-position" }),
            await subscribe({ type: "subscription:scene:pointer", req: { elementIds: [this.dinyId] } }),
            await subscribe({ type: "subscription:camera:moved-debounced" }),
        ];
        const began = await beginPreview([this.dinyId]);
        this.previewing = began.has(this.dinyId);
        if (!this.previewing) this.env.toast("Diny could not start moving. She is just standing there.", "bad");
        this.lastFrameAt = performance.now();
        this.stopLoop = startPreviewLoop((now) => this.frame(now));
        this.giveUpTimer = setTimeout(() => this.release(), GIVE_UP_MS);
        this.env.toast("Click on Diny.");
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
        return [
            {
                drawdyElementId: this.dinyId,
                transform: {
                    x: this.position.x - this.rest.x,
                    y: this.position.y - this.rest.y,
                    scale: 1,
                    rotation: sway,
                },
            },
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
                if (event.body.type === "down" && event.body.drawdyElementIds.includes(this.dinyId)) this.catch();
                return;
            case "subscription:scene:click":
                if (event.body.drawdyElementIds.includes(this.dinyId)) this.catch();
                return;
        }
    }

    private catch(): void {
        if (this.outcome === "caught") return;
        const wasReleased = this.outcome === "released";
        this.outcome = "caught";
        this.target = { ...this.position };
        if (this.giveUpTimer) clearTimeout(this.giveUpTimer);
        this.env.toast("You caught Diny. With a touch screen or devtools, we assume. Cheater.", "good", 5000);
        if (!wasReleased) this.env.complete({ lines: ["You caught Diny.", "She did not see that coming."] });
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
            color: XP.closeRed,
        });
        this.owned.push(line.drawdyElementId);
        void addElements([line]).then(() => {
            this.env.toast(HEARTBREAK, "info", 8000);
            this.env.complete({ lines: ["You did not catch Diny.", "That is fine. Let her go."] });
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
