import { describe, expect, it } from "vitest";
import { CellBox, cellIndexAt, corridorEntrance, corridorExit, generateCorridorPath } from "./exit-corridor";
import { Cell, MazeLayout, TimedPoint, cellCenter, generateMaze, judgeLaserRun, mazeDriftAt } from "./maze";
import { seededRandom } from "./random";

const cellsPerSide = 7;
const cellSize = 112;
const corridorLength = 44;
const revealedCells = 12;
const wallTolerance = 8;
const stepMs = 16;
const origin = { x: 300, y: 200 };
const seeds = [1, 2, 3, 42, 1337];
const minimumTurns = 6;
const box: CellBox = { minRow: -1, maxRow: cellsPerSide, minCol: cellsPerSide, maxCol: cellsPerSide + 5 };

function generateRightExitMazeAndCorridor(seed: number) {
    const random = seededRandom(seed);
    const maze = generateMaze(cellsPerSide, cellSize, random, "right");
    const path = generateCorridorPath(maze, box, corridorLength, random);
    return { maze, path };
}

function solveMazeIntoCellCenters(maze: MazeLayout): { x: number; y: number }[] {
    const key = (c: Cell) => `${c.row},${c.col}`;
    const blocked = (a: Cell, b: Cell) => {
        const mid = { x: ((a.col + b.col) / 2 + 0.5) * cellSize, y: ((a.row + b.row) / 2 + 0.5) * cellSize };
        return maze.walls.some(
            (w) =>
                Math.min(w.a.x, w.b.x) <= mid.x &&
                mid.x <= Math.max(w.a.x, w.b.x) &&
                Math.min(w.a.y, w.b.y) <= mid.y &&
                mid.y <= Math.max(w.a.y, w.b.y)
        );
    };
    const previous = new Map<string, Cell | null>([[key(maze.start), null]]);
    const queue = [maze.start];
    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const next of [
            { row: current.row - 1, col: current.col },
            { row: current.row + 1, col: current.col },
            { row: current.row, col: current.col - 1 },
            { row: current.row, col: current.col + 1 },
        ]) {
            if (next.row < 0 || next.col < 0 || next.row >= cellsPerSide || next.col >= cellsPerSide) continue;
            if (previous.has(key(next)) || blocked(current, next)) continue;
            previous.set(key(next), current);
            queue.push(next);
        }
    }
    const cells: Cell[] = [];
    for (let c: Cell | null = maze.exit.cell; c; c = previous.get(key(c)) ?? null) cells.unshift(c);
    return cells.map((c) => cellCenter(maze, c));
}

function walkThroughPointsFollowingDrift(points: { x: number; y: number }[]): TimedPoint[] {
    const out: TimedPoint[] = [];
    let t = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10));
        for (let s = i === 1 ? 0 : 1; s <= steps; s++) {
            const drift = mazeDriftAt(t);
            out.push({
                x: origin.x + a.x + ((b.x - a.x) * s) / steps + drift.x,
                y: origin.y + a.y + ((b.y - a.y) * s) / steps + drift.y,
                t,
            });
            t += stepMs;
        }
    }
    return out;
}

describe("generateCorridorPath", () => {
    it.each(seeds)("builds a self-avoiding corridor outside the maze that starts at the exit (seed %i)", (seed) => {
        const { maze, path } = generateRightExitMazeAndCorridor(seed);
        expect(path).toHaveLength(corridorLength);
        expect(path[0]).toEqual(corridorEntrance(maze));
        expect(new Set(path.map((c) => `${c.row},${c.col}`)).size).toBe(path.length);
        for (let i = 0; i < path.length; i++) {
            const c = path[i];
            expect(c.row >= 0 && c.row < cellsPerSide && c.col >= 0 && c.col < cellsPerSide).toBe(false);
            expect(c.row >= box.minRow && c.row <= box.maxRow && c.col >= box.minCol && c.col <= box.maxCol).toBe(true);
            if (i > 0) expect(Math.abs(c.row - path[i - 1].row) + Math.abs(c.col - path[i - 1].col)).toBe(1);
        }
    });

    it.each(seeds)("turns at least six times, going up, down and right (seed %i)", (seed) => {
        const { path } = generateRightExitMazeAndCorridor(seed);
        const moves = path.slice(1).map((c, i) => `${c.row - path[i].row},${c.col - path[i].col}`);
        const turns = moves.slice(1).filter((m, i) => m !== moves[i]).length;
        expect(turns).toBeGreaterThanOrEqual(minimumTurns);
        expect(moves).toContain("-1,0");
        expect(moves).toContain("1,0");
        expect(moves).toContain("0,1");
    });
});

describe("corridorExit", () => {
    it.each(seeds)("lets a run that follows the open corridor into the next cell escape once growing has stopped (seed %i)", (seed) => {
        const { maze, path } = generateRightExitMazeAndCorridor(seed);
        const route = [...solveMazeIntoCellCenters(maze), ...path.slice(0, revealedCells + 1).map((c) => cellCenter(maze, c))];
        const exit = corridorExit(maze, origin, path, revealedCells, true);
        expect(judgeLaserRun(maze, origin, walkThroughPointsFollowingDrift(route), wallTolerance, exit)).toEqual({ kind: "escaped" });
    });

    it.each(seeds)("keeps the same run inside while the corridor is still growing (seed %i)", (seed) => {
        const { maze, path } = generateRightExitMazeAndCorridor(seed);
        const route = [...solveMazeIntoCellCenters(maze), ...path.slice(0, revealedCells + 1).map((c) => cellCenter(maze, c))];
        const exit = corridorExit(maze, origin, path, revealedCells, false);
        expect(judgeLaserRun(maze, origin, walkThroughPointsFollowingDrift(route), wallTolerance, exit)).toEqual({ kind: "stopped-inside" });
    });

    it.each(seeds)("reports a wall hit for a run that cuts straight right through the corridor walls (seed %i)", (seed) => {
        const { maze, path } = generateRightExitMazeAndCorridor(seed);
        const entrance = cellCenter(maze, path[0]);
        const route = [...solveMazeIntoCellCenters(maze), entrance, { x: entrance.x + 6 * cellSize, y: entrance.y }];
        const exit = corridorExit(maze, origin, path, corridorLength - 1, true);
        expect(judgeLaserRun(maze, origin, walkThroughPointsFollowingDrift(route), wallTolerance, exit).kind).toBe("hit-wall");
    });
});

describe("cellIndexAt", () => {
    it("finds which corridor cell a local point is in", () => {
        const { maze, path } = generateRightExitMazeAndCorridor(1);
        expect(cellIndexAt(maze, path, cellCenter(maze, path[5]))).toBe(5);
        expect(cellIndexAt(maze, path, cellCenter(maze, maze.start))).toBe(-1);
    });
});
