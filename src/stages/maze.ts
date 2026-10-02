import type { DrawdyElementSchema, DrawdyPreviewElementSchema, DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { challengeTitle } from "../challenges";
import { CellBox, cellIndexAt, cellWalls, corridorExit, generateCorridorPath } from "../exit-corridor";
import { Point, Segment } from "../geometry";
import { newId, subscribe, trySend, unsubscribe } from "../host";
import { ink, trackInk } from "../ink";
import {
    Cell,
    MazeLayout,
    TimedPoint,
    cellCenter,
    generateMaze,
    judgeLaserStep,
    mazeDriftAt,
    placeLocal,
    toLocal,
    wallPoseAt,
} from "../maze";
import { PreviewFrame, beginPreview, endPreview, startPreviewLoop } from "../preview-loop";
import { Random, seededRandom } from "../random";
import { addElements, updateElements } from "../scene";
import { tag, textLine } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { BUTTON } from "../theme";

const CELLS = 7;
const CELL_SIZE = 112;
const WALL_WIDTH = 10;
const WALL_TOLERANCE = WALL_WIDTH / 2 + 3;
const START_RADIUS = 36;
const LASER_TOOL = "laser-pointer";
const MISSED_START_COOLDOWN_MS = 2500;
const HIT_MARKER_MS = 1400;
export const CORRIDOR_LENGTH = 64;
export const CORRIDOR_BOX: CellBox = { minRow: -1, maxRow: CELLS, minCol: CELLS, maxCol: CELLS + 7 };
const INITIAL_REVEALED = 1;
const REVEAL_STEP = 2;
const STRETCH_MS = 20_000;
const CORRIDOR_REDRAW_MS = 100;
const LAUGHS = ["hehehe 😆", "hehehehe 😆", "hehehe 😆", "hehe 😆"];

export const MAZE_REGION = { width: 1980, height: 1320 };

type Run = { last: TimedPoint; laserConfirmed: boolean | null };
type WallBatch = { previewId: string; ids: string[]; walls: Segment[] };

export class MazeStage implements Stage {
    readonly id = "maze" as const;
    private owned: string[] = [];
    private required: string[] = [];
    private maze: MazeLayout | null = null;
    private origin: Point = { x: 0, y: 0 };
    private wallIds: string[] = [];
    private driftingIds: string[] = [];
    private startId = "";
    private exitId = "";
    private run: Run | null = null;
    private solved = false;
    private stopLoop: (() => void) | null = null;
    private subscriptions: (string | null)[] = [];
    private previewing = false;
    private lastMissedStartToast = 0;
    private hitMarkers = new Set<string>();
    private corridor: Cell[] = [];
    private revealed = INITIAL_REVEALED;
    private stretchStartedAt: number | null = null;
    private batches: WallBatch[] = [];
    private lastCorridorRedraw = 0;
    private random: Random;

    constructor(private readonly env: StageEnv) {
        this.random = seededRandom(env.seed);
    }

    async build(): Promise<void> {
        const { x, y } = this.env.region;
        const maze = generateMaze(CELLS, CELL_SIZE, this.random, "right");
        this.maze = maze;
        this.corridor = generateCorridorPath(maze, CORRIDOR_BOX, CORRIDOR_LENGTH, this.random);
        this.origin = { x: x + 100, y: y + 170 + CELL_SIZE };
        const title = textLine({
            stage: this.id,
            role: "title",
            anchor: this.env.anchor,
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
        const labelAt = cellCenter(maze, this.corridor[INITIAL_REVEALED]);
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
        await this.revealCells(0, INITIAL_REVEALED);
        this.stopLoop = startPreviewLoop((now) => this.frame(now));
        this.env.toast("Use the laser pointer. Don't touch the walls.", "info", 5000);
    }

    requiredIds(): Iterable<string> {
        return this.required;
    }

    ownedIds(): Iterable<string> {
        return this.owned;
    }

    private wallSchema(id: string, local: Segment, now: number): DrawdyPreviewElementSchema {
        const placed = placeLocal(this.origin, local, now);
        return {
            type: "line",
            drawdyElementId: id,
            from: [placed.a.x, placed.a.y],
            to: [placed.b.x, placed.b.y],
            color: ink("wall"),
            strokeWidth: WALL_WIDTH,
            roughness: 0,
        };
    }

    private async revealCells(fromIndex: number, toIndex: number): Promise<void> {
        const maze = this.maze;
        if (!maze || toIndex <= fromIndex) return;
        const walls: Segment[] = [];
        for (let i = fromIndex; i < toIndex; i++) walls.push(...cellWalls(maze, this.corridor, i));
        const ids = walls.map(() => newId());
        const now = performance.now();
        const created = await trySend({
            type: "command:scene:create-drawdy-preview-elements",
            req: { elements: walls.map((wall, i) => this.wallSchema(ids[i], wall, now)) },
        });
        if (created) this.batches.push({ previewId: created.previewId, ids, walls });
    }

    private async collapseCorridor(): Promise<void> {
        const extra = this.batches.splice(1);
        if (extra.length === 0) return;
        await trySend({
            type: "command:scene:delete-drawdy-preview-elements",
            req: { previewIds: extra.map((b) => b.previewId) },
        });
    }

    private async frame(now: number): Promise<PreviewFrame> {
        const maze = this.maze;
        if (!maze || !this.previewing) return [];
        if (now - this.lastCorridorRedraw >= CORRIDOR_REDRAW_MS && this.batches.length > 0) {
            this.lastCorridorRedraw = now;
            await trySend({
                type: "command:scene:update-drawdy-preview-elements",
                req: { elements: this.batches.flatMap((b) => b.walls.map((wall, i) => this.wallSchema(b.ids[i], wall, now))) },
            });
        }
        const drift = mazeDriftAt(now);
        const labelRest = cellCenter(maze, this.corridor[INITIAL_REVEALED]);
        const labelNow = cellCenter(maze, this.corridor[Math.min(this.revealed, this.corridor.length - 1)]);
        return [
            ...this.wallIds.map((drawdyElementId, i) => {
                const pose = wallPoseAt(maze, i, now);
                return { drawdyElementId, transform: { x: pose.dx, y: pose.dy, scale: 1, rotation: pose.rotation } };
            }),
            ...this.driftingIds.map((drawdyElementId) => {
                const isExit = drawdyElementId === this.exitId;
                const shiftX = isExit ? labelNow.x - labelRest.x : 0;
                const shiftY = isExit ? labelNow.y - labelRest.y : 0;
                return {
                    drawdyElementId,
                    transform: { x: drift.x + shiftX, y: drift.y + shiftY, scale: 1, rotation: 0 },
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
        const run: Run = { last: { ...at, t: performance.now() }, laserConfirmed: null };
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

    private stretchOver(now: number): boolean {
        if (this.revealed >= this.corridor.length - 1) return true;
        return this.stretchStartedAt !== null && now - this.stretchStartedAt >= STRETCH_MS;
    }

    private advanceRun(at: Point): void {
        const run = this.run;
        const maze = this.maze;
        if (!run || !maze) return;
        const next = { ...at, t: performance.now() };
        const exit = corridorExit(maze, this.origin, this.corridor, this.revealed, this.stretchOver(next.t));
        const verdict = judgeLaserStep(maze, this.origin, run.last, next, WALL_TOLERANCE, exit);
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
            const { x, y } = this.env.region;
            this.env.complete({
                lines: ["You got out without touching a wall."],
                textAt: { x: x + 100, y: y + 1215 },
                goAt: { x: x + 1880, y: y + 1230 },
            });
            return;
        }
        if (this.stretchOver(next.t)) return;
        const cell = cellIndexAt(maze, this.corridor, toLocal(this.origin, next, next.t));
        if (cell >= 0 && cell >= this.revealed - 1) this.stretch(next.t);
    }

    private stretch(now: number): void {
        if (this.stretchStartedAt === null) this.stretchStartedAt = now;
        const from = this.revealed;
        this.revealed = Math.min(this.corridor.length - 1, this.revealed + REVEAL_STEP);
        void this.revealCells(from, this.revealed);
        this.env.toast(LAUGHS[Math.floor(this.random() * LAUGHS.length)], "info", 1500);
    }

    private endRun(): void {
        this.run = null;
        this.revealed = INITIAL_REVEALED;
        this.stretchStartedAt = null;
        void this.collapseCorridor();
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
        const batches = this.batches.splice(0);
        if (batches.length > 0) {
            await trySend({
                type: "command:scene:delete-drawdy-preview-elements",
                req: { previewIds: batches.map((b) => b.previewId) },
            });
        }
        for (const id of this.subscriptions) await unsubscribe(id);
        this.subscriptions = [];
        if (this.previewing) await endPreview();
        this.previewing = false;
    }
}
