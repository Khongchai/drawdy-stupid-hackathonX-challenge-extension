import type { DrawdyElementSchema, DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { Point } from "../geometry";
import { newId, subscribe, trySend, unsubscribe } from "../host";
import {
    MazeLayout,
    TimedPoint,
    cellCenter,
    exitMarkerPoint,
    generateMaze,
    judgeLaserStep,
    mazeDriftAt,
    wallPoseAt,
} from "../maze";
import { PreviewFrame, beginPreview, endPreview, startPreviewLoop } from "../preview-loop";
import { seededRandom } from "../random";
import { addElements, updateElements } from "../scene";
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

type Run = { last: TimedPoint; laserConfirmed: boolean | null };

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
            text: "Challenge 4 of 4: อย่าชนขอบ",
            fontSize: 46,
            ink: "title",
        });
        const subtitle = textLine({
            stage: this.id,
            role: "subtitle",
            x: x + 40,
            y: y + 96,
            text: "Drag from the green circle to the exit. Don't touch the walls.",
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
        const exitPoint = exitMarkerPoint(maze, 70);
        const exitLabel = textLine({
            stage: this.id,
            role: "exit",
            x: this.origin.x + exitPoint.x - 34,
            y: this.origin.y + exitPoint.y - 16,
            text: "EXIT",
            fontSize: 28,
            ink: "warm",
        });
        this.wallIds = walls.map((w) => w.drawdyElementId);
        this.startId = start.drawdyElementId;
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
        this.stopLoop = startPreviewLoop((now) => this.frame(now));
        this.env.toast("Get out without touching a wall.", "info", 5000);
    }

    requiredIds(): Iterable<string> {
        return this.required;
    }

    ownedIds(): Iterable<string> {
        return this.owned;
    }

    private frame(now: number): PreviewFrame {
        const maze = this.maze;
        if (!maze || !this.previewing) return [];
        const drift = mazeDriftAt(now);
        return [
            ...this.wallIds.map((drawdyElementId, i) => {
                const pose = wallPoseAt(maze, i, now);
                return { drawdyElementId, transform: { x: pose.dx, y: pose.dy, scale: 1, rotation: pose.rotation } };
            }),
            ...this.driftingIds.map((drawdyElementId) => ({
                drawdyElementId,
                transform: { x: drift.x, y: drift.y, scale: 1, rotation: 0 },
            })),
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
                this.run = null;
                this.env.toast("Wrong tool.", "bad");
            }
        });
    }

    private advanceRun(at: Point): void {
        const run = this.run;
        const maze = this.maze;
        if (!run || !maze) return;
        const next = { ...at, t: performance.now() };
        const verdict = judgeLaserStep(maze, this.origin, run.last, next, WALL_TOLERANCE);
        run.last = next;
        if (verdict === "hit-wall") {
            this.run = null;
            void this.showHitMarker(at);
            this.env.toast("You touched a wall.", "bad");
            return;
        }
        if (verdict === "escaped") {
            this.run = null;
            if (run.laserConfirmed === false) return;
            this.solved = true;
            this.env.toast("You got out.", "good", 5000);
            this.env.complete({ lines: ["You got out without touching a wall."] });
        }
    }

    private onLaserReleased(): void {
        if (this.run) {
            this.run = null;
            this.env.toast("You let go too early.", "bad");
            return;
        }
        const now = Date.now();
        if (now - this.lastMissedStartToast < MISSED_START_COOLDOWN_MS) return;
        this.lastMissedStartToast = now;
        this.env.toast("Start on the green circle.", "info");
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
        for (const id of this.subscriptions) await unsubscribe(id);
        this.subscriptions = [];
        if (this.previewing) await endPreview();
        this.previewing = false;
    }
}
