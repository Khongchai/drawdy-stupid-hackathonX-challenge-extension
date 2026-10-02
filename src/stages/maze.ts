import type { DrawdyElementSchema, DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { challengeTitle } from "../challenges";
import { Point } from "../geometry";
import { newId, subscribe, trySend, unsubscribe } from "../host";
import {
    MazeLayout,
    TimedPoint,
    cellCenter,
    exitGap,
    generateMaze,
    judgeLaserStep,
    mazeDriftAt,
    stretchProgress,
    stretchWallsAt,
    wallPoseAt,
} from "../maze";
import { PreviewFrame, beginPreview, endPreview, startPreviewLoop } from "../preview-loop";
import { seededRandom } from "../random";
import { addElements, flyTo, updateElements } from "../scene";
import { tag, textLine } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { BUTTON } from "../theme";
import { ink, trackInk } from "../ink";

const CELLS = 7;
const CELL_SIZE = 112;
const WALL_WIDTH = 10;
const WALL_TOLERANCE = WALL_WIDTH / 2 + 3;
const START_RADIUS = 36;
const LASER_TOOL = "laser-pointer";
const MISSED_START_COOLDOWN_MS = 2500;
const HIT_MARKER_MS = 1400;
const STRETCH_BASE = CELL_SIZE * 0.75;
const STRETCH_STEP = CELL_SIZE * 1.6;
const STRETCH_TRIGGER = CELL_SIZE * 0.9;
const STRETCH_TAU_S = 0.12;
const MIN_EXTENSIONS = 4;
const MAX_EXTENSIONS = 6;
const CAMERA_PAN_MS = 350;
const EXIT_LABEL_GAP = 50;
const EXTENSION_TAUNTS = ["Almost.", "So close.", "Keep going.", "The exit moved. Exits do that.", "Just a bit more.", "Nearly there. Probably."];

type Run = { last: TimedPoint; laserConfirmed: boolean | null; extensionsLeft: number };

export class MazeStage implements Stage {
    readonly id = "maze" as const;
    private owned: string[] = [];
    private required: string[] = [];
    private maze: MazeLayout | null = null;
    private origin: Point = { x: 0, y: 0 };
    private wallIds: string[] = [];
    private driftingIds: string[] = [];
    private startId = "";
    private run: Run | null = null;
    private solved = false;
    private stopLoop: (() => void) | null = null;
    private subscriptions: (string | null)[] = [];
    private previewing = false;
    private lastMissedStartToast = 0;
    private hitMarkers = new Set<string>();
    private exitId = "";
    private stretchIds: [string, string] = ["", ""];
    private stretchPreviewId: string | null = null;
    private stretchTarget = STRETCH_BASE;
    private stretchVisible = STRETCH_BASE;
    private lastFrameAt = 0;
    private panned = 0;
    private random = seededRandom(Date.now());

    constructor(private readonly env: StageEnv) {}

    async build(): Promise<void> {
        const { x, y, width, height } = this.env.region;
        const maze = generateMaze(CELLS, CELL_SIZE, seededRandom(Date.now()));
        this.maze = maze;
        const side = CELLS * CELL_SIZE;
        this.origin = { x: x + (width - side) / 2, y: y + 170 + (height - 170 - side) / 2 };
        const title = textLine({
            stage: this.id,
            role: "title",
            x: x + 40,
            y: y + 30,
            text: `${challengeTitle(this.id)}: อย่าชนขอบ`,
            fontSize: 46,
            ink: "title",
        });
        const subtitle = textLine({
            stage: this.id,
            role: "subtitle",
            x: x + 40,
            y: y + 96,
            text: "Use the laser pointer. Drag from the green circle to the exit. Don't touch the walls.",
            fontSize: 26,
            ink: "accent",
        });
        const walls: DrawdyElementSchema[] = maze.walls.map((wall) => {
            const drawdyElementId = newId();
            trackInk(drawdyElementId, "wall");
            return {
                type: "line",
                drawdyElementId,
                from: [this.origin.x + wall.a.x, this.origin.y + wall.a.y],
                to: [this.origin.x + wall.b.x, this.origin.y + wall.b.y],
                color: ink("wall"),
                strokeWidth: WALL_WIDTH,
                roughness: 0,
                meta: tag(this.id, "wall"),
            };
        });
        const startLocal = cellCenter(maze, maze.start);
        const start: DrawdyElementSchema = {
            type: "shape",
            componentType: "circle",
            drawdyElementId: newId(),
            x: this.origin.x + startLocal.x - START_RADIUS,
            y: this.origin.y + startLocal.y - START_RADIUS,
            width: START_RADIUS * 2,
            height: START_RADIUS * 2,
            strokeColor: BUTTON.go.edge,
            fillColor: BUTTON.go.face,
            strokeWidth: 3,
            roughness: 0,
            fillStyle: "solid",
            text: "Start",
            fontSize: 15,
            textColor: "#ffffff",
            meta: tag(this.id, "start"),
        };
        const gap = exitGap(maze);
        const labelAt = {
            x: (gap.a.x + gap.b.x) / 2 + gap.direction.x * (STRETCH_BASE + EXIT_LABEL_GAP),
            y: (gap.a.y + gap.b.y) / 2 + gap.direction.y * (STRETCH_BASE + EXIT_LABEL_GAP),
        };
        const exitLabel = textLine({
            stage: this.id,
            role: "exit",
            x: this.origin.x + labelAt.x - 34,
            y: this.origin.y + labelAt.y - 16,
            text: "EXIT",
            fontSize: 28,
            ink: "warm",
        });
        this.wallIds = walls.map((w) => w.drawdyElementId);
        this.startId = start.drawdyElementId;
        this.exitId = exitLabel.drawdyElementId;
        this.driftingIds = [start.drawdyElementId, exitLabel.drawdyElementId];
        const elements = [title, subtitle, ...walls, start, exitLabel];
        this.owned = elements.map((e) => e.drawdyElementId);
        this.required = [title.drawdyElementId, ...this.wallIds, ...this.driftingIds];
        await addElements(elements);
        await updateElements(
            [...this.wallIds, ...this.driftingIds].map((id) => ({ drawdyElementId: id, properties: { locked: true } }))
        );
        this.subscriptions = [
            await subscribe({ type: "subscription:scene:pointer-position" }),
            await subscribe({ type: "subscription:scene:pointer", req: { elementIds: [this.startId] } }),
        ];
        const began = await beginPreview([...this.wallIds, ...this.driftingIds]);
        this.previewing = began.size > 0;
        this.stretchIds = [newId(), newId()];
        const stretch = await trySend({
            type: "command:scene:create-drawdy-preview-elements",
            req: { elements: this.stretchSchemas(performance.now()) },
        });
        this.stretchPreviewId = stretch?.previewId ?? null;
        this.lastFrameAt = performance.now();
        this.stopLoop = startPreviewLoop((now) => this.frame(now));
        this.env.toast("Use the laser pointer. Don't touch the walls.", "info", 5000);
    }

    requiredIds(): Iterable<string> {
        return this.required;
    }

    ownedIds(): Iterable<string> {
        return this.owned;
    }

    private stretchSchemas(now: number) {
        const walls = stretchWallsAt(this.maze!, this.origin, this.stretchVisible, now);
        return walls.map((wall, i) => ({
            type: "line" as const,
            drawdyElementId: this.stretchIds[i],
            from: [wall.a.x, wall.a.y] as [number, number],
            to: [wall.b.x, wall.b.y] as [number, number],
            color: ink("wall"),
            strokeWidth: WALL_WIDTH,
            roughness: 0,
        }));
    }

    private async frame(now: number): Promise<PreviewFrame> {
        const maze = this.maze;
        if (!maze || !this.previewing) return [];
        const dt = Math.min(0.1, (now - this.lastFrameAt) / 1000);
        this.lastFrameAt = now;
        this.stretchVisible += (this.stretchTarget - this.stretchVisible) * (1 - Math.exp(-dt / STRETCH_TAU_S));
        if (this.stretchPreviewId) {
            await trySend({ type: "command:scene:update-drawdy-preview-elements", req: { elements: this.stretchSchemas(now) } });
        }
        const drift = mazeDriftAt(now);
        const direction = exitGap(maze).direction;
        const exitShift = this.stretchVisible - STRETCH_BASE;
        return [
            ...this.wallIds.map((drawdyElementId, i) => {
                const pose = wallPoseAt(maze, i, now);
                return { drawdyElementId, transform: { x: pose.dx, y: pose.dy, scale: 1, rotation: pose.rotation } };
            }),
            ...this.driftingIds.map((drawdyElementId) => {
                const shift = drawdyElementId === this.exitId ? exitShift : 0;
                return {
                    drawdyElementId,
                    transform: { x: drift.x + direction.x * shift, y: drift.y + direction.y * shift, scale: 1, rotation: 0 },
                };
            }),
        ];
    }

    handle(event: DriverSubscriptionEvent): void {
        if (this.solved) return;
        switch (event.type) {
            case "subscription:scene:pointer":
                if (event.body.type === "down" && event.body.drawdyElementIds.includes(this.startId)) {
                    this.beginRun(event.body.cursor.canvasSpace);
                }
                return;
            case "subscription:scene:pointer-position":
                this.advanceRun(event.body.position.canvasSpace);
                return;
            case "subscription:tool:laser":
                if (event.body.lasers.length > 0) this.onLaserReleased();
                return;
        }
    }

    private beginRun(at: Point): void {
        const extensionsLeft = MIN_EXTENSIONS + Math.floor(this.random() * (MAX_EXTENSIONS - MIN_EXTENSIONS + 1));
        const run: Run = { last: { ...at, t: performance.now() }, laserConfirmed: null, extensionsLeft };
        this.run = run;
        void trySend({ type: "command:tools:get-active" }).then((value) => {
            if (this.run !== run) return;
            run.laserConfirmed = value?.toolId === LASER_TOOL;
            if (!run.laserConfirmed) {
                this.endRun();
                this.env.tantrum("wrong-tool");
            }
        });
    }

    private advanceRun(at: Point): void {
        const run = this.run;
        const maze = this.maze;
        if (!run || !maze) return;
        const next = { ...at, t: performance.now() };
        const verdict = judgeLaserStep(maze, this.origin, run.last, next, WALL_TOLERANCE, this.stretchTarget);
        run.last = next;
        if (verdict === "hit-wall") {
            this.endRun();
            void this.showHitMarker(at);
            this.env.tantrum("wall", at);
            return;
        }
        if (verdict === "escaped") {
            this.run = null;
            if (run.laserConfirmed === false) return;
            this.solved = true;
            this.env.toast("You got out.", "good", 5000);
            void flyTo(this.env.region, 600).then(() =>
                this.env.complete({ lines: ["You got out without touching a wall."] })
            );
            return;
        }
        const progress = stretchProgress(maze, this.origin, next, next.t);
        if (run.extensionsLeft > 0 && progress > Math.max(0, this.stretchTarget - STRETCH_TRIGGER)) {
            run.extensionsLeft--;
            this.stretchTarget += STRETCH_STEP;
            void this.panCamera(STRETCH_STEP);
            this.env.toast(EXTENSION_TAUNTS[Math.floor(this.random() * EXTENSION_TAUNTS.length)], "info", 1500);
        }
    }

    private async panCamera(distance: number): Promise<void> {
        const maze = this.maze;
        const viewport = (await trySend({ type: "command:camera:get-viewport-rect" }))?.rect;
        if (!maze || !viewport) return;
        const direction = exitGap(maze).direction;
        this.panned += distance;
        await trySend({
            type: "command:camera:fly-to-rect",
            req: {
                rect: { ...viewport, x: viewport.x + direction.x * distance, y: viewport.y + direction.y * distance },
                flyDurationMs: CAMERA_PAN_MS,
                zoom: 1000,
            },
        });
    }

    private endRun(): void {
        this.run = null;
        this.stretchTarget = STRETCH_BASE;
        if (this.panned > 0) {
            this.panned = 0;
            void flyTo(this.env.region, 500);
        }
    }

    private onLaserReleased(): void {
        const run = this.run;
        if (run) {
            this.endRun();
            this.env.tantrum("let-go", run.last);
            return;
        }
        const now = Date.now();
        if (now - this.lastMissedStartToast < MISSED_START_COOLDOWN_MS) return;
        this.lastMissedStartToast = now;
        this.env.tantrum("missed-start");
    }

    private async showHitMarker(at: Point): Promise<void> {
        const value = await trySend({
            type: "command:scene:create-drawdy-preview-elements",
            req: {
                elements: [
                    {
                        type: "shape",
                        componentType: "circle",
                        drawdyElementId: newId(),
                        x: at.x - 22,
                        y: at.y - 22,
                        width: 44,
                        height: 44,
                        strokeColor: BUTTON.close,
                        fillColor: BUTTON.close,
                        strokeWidth: 4,
                        roughness: 0,
                        fillStyle: "cross-hatch",
                        opacity: 0.8,
                    },
                ],
            },
        });
        if (!value) return;
        this.hitMarkers.add(value.previewId);
        setTimeout(() => void this.deleteHitMarkers([value.previewId]), HIT_MARKER_MS);
    }

    private async deleteHitMarkers(previewIds: string[]): Promise<void> {
        const live = previewIds.filter((id) => this.hitMarkers.delete(id));
        if (live.length === 0) return;
        await trySend({ type: "command:scene:delete-drawdy-preview-elements", req: { previewIds: live } });
    }

    async dispose(): Promise<void> {
        this.stopLoop?.();
        this.stopLoop = null;
        this.run = null;
        await this.deleteHitMarkers([...this.hitMarkers]);
        if (this.stretchPreviewId) {
            await trySend({ type: "command:scene:delete-drawdy-preview-elements", req: { previewIds: [this.stretchPreviewId] } });
            this.stretchPreviewId = null;
        }
        for (const id of this.subscriptions) await unsubscribe(id);
        this.subscriptions = [];
        if (this.previewing) await endPreview();
        this.previewing = false;
    }
}
