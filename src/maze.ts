import {
    Point,
    Rect,
    Segment,
    distance,
    distanceBetweenSegments,
    rotateAround,
} from "./geometry";
import { Random } from "./random";

export type Cell = { row: number; col: number };
export type Side = "top" | "bottom" | "left" | "right";
export type TimedPoint = Point & { t: number };

export type MazeLayout = {
    cells: number;
    cellSize: number;
    walls: Segment[];
    wallPhases: number[];
    start: Cell;
    exit: { cell: Cell; side: Side };
};

export type WallPose = { dx: number; dy: number; rotation: number };

export type LaserVerdict =
    | { kind: "escaped" }
    | { kind: "hit-wall"; at: Point }
    | { kind: "started-outside-center" }
    | { kind: "stopped-inside" };

export const MAZE_MOTION = {
    driftX: 46,
    driftY: 30,
    driftPeriodXMs: 19000,
    driftPeriodYMs: 26000,
    wobblePx: 5,
    wobblePeriodMs: 2800,
};

const key = (a: Cell, b: Cell) => {
    const [first, second] =
        a.row < b.row || (a.row === b.row && a.col <= b.col) ? [a, b] : [b, a];
    return `${first.row},${first.col}|${second.row},${second.col}`;
};

function neighbours(cell: Cell, cells: number): Cell[] {
    return [
        { row: cell.row - 1, col: cell.col },
        { row: cell.row + 1, col: cell.col },
        { row: cell.row, col: cell.col - 1 },
        { row: cell.row, col: cell.col + 1 },
    ].filter((c) => c.row >= 0 && c.col >= 0 && c.row < cells && c.col < cells);
}

function carvePassages(cells: number, start: Cell, random: Random): Set<string> {
    const open = new Set<string>();
    const visited = new Set<string>([`${start.row},${start.col}`]);
    const stack: Cell[] = [start];
    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const unvisited = neighbours(current, cells).filter(
            (c) => !visited.has(`${c.row},${c.col}`)
        );
        if (unvisited.length === 0) {
            stack.pop();
            continue;
        }
        const next = unvisited[Math.floor(random() * unvisited.length)];
        open.add(key(current, next));
        visited.add(`${next.row},${next.col}`);
        stack.push(next);
    }
    return open;
}

function distancesFrom(start: Cell, cells: number, open: Set<string>): Map<string, number> {
    const result = new Map<string, number>([[`${start.row},${start.col}`, 0]]);
    const queue: Cell[] = [start];
    while (queue.length > 0) {
        const current = queue.shift()!;
        const steps = result.get(`${current.row},${current.col}`)!;
        for (const next of neighbours(current, cells)) {
            const id = `${next.row},${next.col}`;
            if (result.has(id) || !open.has(key(current, next))) continue;
            result.set(id, steps + 1);
            queue.push(next);
        }
    }
    return result;
}

function outerSidesOf(cell: Cell, cells: number): Side[] {
    const sides: Side[] = [];
    if (cell.row === 0) sides.push("top");
    if (cell.row === cells - 1) sides.push("bottom");
    if (cell.col === 0) sides.push("left");
    if (cell.col === cells - 1) sides.push("right");
    return sides;
}

function pickExit(cells: number, open: Set<string>, start: Cell): { cell: Cell; side: Side } {
    const steps = distancesFrom(start, cells, open);
    let best: Cell = { row: 0, col: 0 };
    let bestSteps = -1;
    for (let row = 0; row < cells; row++) {
        for (let col = 0; col < cells; col++) {
            const cell = { row, col };
            if (outerSidesOf(cell, cells).length === 0) continue;
            const s = steps.get(`${row},${col}`) ?? -1;
            if (s > bestSteps) {
                best = cell;
                bestSteps = s;
            }
        }
    }
    return { cell: best, side: outerSidesOf(best, cells)[0] };
}

function isExitEdge(
    exit: { cell: Cell; side: Side },
    orientation: "horizontal" | "vertical",
    line: number,
    index: number,
    cells: number
): boolean {
    if (orientation === "horizontal") {
        return (
            index === exit.cell.col &&
            ((exit.side === "top" && line === 0) ||
                (exit.side === "bottom" && line === cells))
        );
    }
    return (
        index === exit.cell.row &&
        ((exit.side === "left" && line === 0) ||
            (exit.side === "right" && line === cells))
    );
}

function buildWalls(
    cells: number,
    cellSize: number,
    open: Set<string>,
    exit: { cell: Cell; side: Side }
): Segment[] {
    const walls: Segment[] = [];
    const hasHorizontalEdge = (line: number, col: number) => {
        if (isExitEdge(exit, "horizontal", line, col, cells)) return false;
        if (line === 0 || line === cells) return true;
        return !open.has(key({ row: line - 1, col }, { row: line, col }));
    };
    const hasVerticalEdge = (line: number, row: number) => {
        if (isExitEdge(exit, "vertical", line, row, cells)) return false;
        if (line === 0 || line === cells) return true;
        return !open.has(key({ row, col: line - 1 }, { row, col: line }));
    };
    for (let line = 0; line <= cells; line++) {
        let runStart: number | null = null;
        for (let i = 0; i <= cells; i++) {
            const present = i < cells && hasHorizontalEdge(line, i);
            if (present && runStart === null) runStart = i;
            if (!present && runStart !== null) {
                walls.push({
                    a: { x: runStart * cellSize, y: line * cellSize },
                    b: { x: i * cellSize, y: line * cellSize },
                });
                runStart = null;
            }
        }
    }
    for (let line = 0; line <= cells; line++) {
        let runStart: number | null = null;
        for (let i = 0; i <= cells; i++) {
            const present = i < cells && hasVerticalEdge(line, i);
            if (present && runStart === null) runStart = i;
            if (!present && runStart !== null) {
                walls.push({
                    a: { x: line * cellSize, y: runStart * cellSize },
                    b: { x: line * cellSize, y: i * cellSize },
                });
                runStart = null;
            }
        }
    }
    return walls;
}

export function generateMaze(cells: number, cellSize: number, random: Random): MazeLayout {
    const center = Math.floor(cells / 2);
    const start = { row: center, col: center };
    const open = carvePassages(cells, start, random);
    const exit = pickExit(cells, open, start);
    const walls = buildWalls(cells, cellSize, open, exit);
    return {
        cells,
        cellSize,
        walls,
        wallPhases: walls.map(() => random() * Math.PI * 2),
        start,
        exit,
    };
}

export function cellCenter(maze: MazeLayout, cell: Cell): Point {
    return {
        x: (cell.col + 0.5) * maze.cellSize,
        y: (cell.row + 0.5) * maze.cellSize,
    };
}

export function exitMarkerPoint(maze: MazeLayout, offset: number): Point {
    const c = cellCenter(maze, maze.exit.cell);
    const half = maze.cellSize / 2;
    switch (maze.exit.side) {
        case "top":
            return { x: c.x, y: c.y - half - offset };
        case "bottom":
            return { x: c.x, y: c.y + half + offset };
        case "left":
            return { x: c.x - half - offset, y: c.y };
        case "right":
            return { x: c.x + half + offset, y: c.y };
    }
}

export function mazeDriftAt(tMs: number): Point {
    return {
        x: MAZE_MOTION.driftX * Math.sin((2 * Math.PI * tMs) / MAZE_MOTION.driftPeriodXMs),
        y: MAZE_MOTION.driftY * Math.sin((2 * Math.PI * tMs) / MAZE_MOTION.driftPeriodYMs),
    };
}

export function wallPoseAt(maze: MazeLayout, index: number, tMs: number): WallPose {
    const drift = mazeDriftAt(tMs);
    const phase = maze.wallPhases[index];
    const wall = maze.walls[index];
    const halfLength = Math.max(distance(wall.a, wall.b) / 2, 1);
    const omega = (2 * Math.PI * tMs) / MAZE_MOTION.wobblePeriodMs;
    return {
        dx: drift.x + MAZE_MOTION.wobblePx * Math.sin(omega + phase),
        dy: drift.y + MAZE_MOTION.wobblePx * Math.cos(omega * 0.77 + phase),
        rotation: (MAZE_MOTION.wobblePx / halfLength) * Math.sin(omega * 1.13 + phase * 1.7),
    };
}

export function posedWall(maze: MazeLayout, origin: Point, index: number, tMs: number): Segment {
    const wall = maze.walls[index];
    const pose = wallPoseAt(maze, index, tMs);
    const pivot = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
    const place = (p: Point) => {
        const turned = rotateAround(p, pivot, pose.rotation);
        return { x: origin.x + turned.x + pose.dx, y: origin.y + turned.y + pose.dy };
    };
    return { a: place(wall.a), b: place(wall.b) };
}

export function mazeBoundsAt(maze: MazeLayout, origin: Point, tMs: number): Rect {
    const drift = mazeDriftAt(tMs);
    const side = maze.cells * maze.cellSize;
    return { x: origin.x + drift.x, y: origin.y + drift.y, width: side, height: side };
}

function isOutside(bounds: Rect, p: Point, margin: number): boolean {
    return (
        p.x < bounds.x - margin ||
        p.y < bounds.y - margin ||
        p.x > bounds.x + bounds.width + margin ||
        p.y > bounds.y + bounds.height + margin
    );
}

export type StepVerdict = "clear" | "hit-wall" | "escaped";

export function judgeLaserStep(
    maze: MazeLayout,
    origin: Point,
    from: TimedPoint,
    to: TimedPoint,
    tolerance: number
): StepVerdict {
    const step = { a: from, b: to };
    for (let w = 0; w < maze.walls.length; w++) {
        if (distanceBetweenSegments(step, posedWall(maze, origin, w, to.t)) <= tolerance) return "hit-wall";
    }
    return isOutside(mazeBoundsAt(maze, origin, to.t), to, tolerance) ? "escaped" : "clear";
}

export function startCenterAt(maze: MazeLayout, origin: Point, tMs: number): Point {
    const drift = mazeDriftAt(tMs);
    const local = cellCenter(maze, maze.start);
    return { x: origin.x + local.x + drift.x, y: origin.y + local.y + drift.y };
}

export function judgeLaserRun(
    maze: MazeLayout,
    origin: Point,
    path: readonly TimedPoint[],
    tolerance: number
): LaserVerdict {
    if (path.length === 0) return { kind: "started-outside-center" };
    if (distance(path[0], startCenterAt(maze, origin, path[0].t)) > maze.cellSize * 0.45) {
        return { kind: "started-outside-center" };
    }
    for (let i = 1; i < path.length; i++) {
        const verdict = judgeLaserStep(maze, origin, path[i - 1], path[i], tolerance);
        if (verdict === "hit-wall") return { kind: "hit-wall", at: { x: path[i].x, y: path[i].y } };
        if (verdict === "escaped") return { kind: "escaped" };
    }
    return { kind: "stopped-inside" };
}
