import { describe, expect, it } from "vitest";
import {
    Cell,
    MazeLayout,
    TimedPoint,
    cellCenter,
    exitMarkerPoint,
    generateMaze,
    exitGap,
    judgeLaserRun,
    mazeDriftAt,
} from "./maze";
import { seededRandom } from "./random";

const cellsPerSide = 5;
const cellSize = 140;
const wallTolerance = 8;
const origin = { x: 1000, y: -400 };
const stepMs = 16;
const seeds = [1, 2, 3, 42, 1337];
const harderCellsPerSide = 7;
const harderCellSize = 112;
const pastExitDistance = 80;
const stretchLength = 600;
const shortOfStretchEnd = 40;
const sidewaysOffset = 120;

function openNeighbourCells(maze: MazeLayout, cell: Cell): Cell[] {
    const center = cellCenter(maze, cell);
    const candidates = [
        { row: cell.row - 1, col: cell.col },
        { row: cell.row + 1, col: cell.col },
        { row: cell.row, col: cell.col - 1 },
        { row: cell.row, col: cell.col + 1 },
    ].filter((c) => c.row >= 0 && c.col >= 0 && c.row < maze.cells && c.col < maze.cells);
    return candidates.filter((c) => {
        const other = cellCenter(maze, c);
        const mid = { x: (center.x + other.x) / 2, y: (center.y + other.y) / 2 };
        return !maze.walls.some(
            (w) =>
                Math.min(w.a.x, w.b.x) <= mid.x &&
                mid.x <= Math.max(w.a.x, w.b.x) &&
                Math.min(w.a.y, w.b.y) <= mid.y &&
                mid.y <= Math.max(w.a.y, w.b.y)
        );
    });
}

function solveMazeIntoCellPath(maze: MazeLayout): Cell[] {
    const id = (c: Cell) => `${c.row},${c.col}`;
    const previous = new Map<string, Cell | null>([[id(maze.start), null]]);
    const queue = [maze.start];
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (id(current) === id(maze.exit.cell)) break;
        for (const next of openNeighbourCells(maze, current)) {
            if (previous.has(id(next))) continue;
            previous.set(id(next), current);
            queue.push(next);
        }
    }
    const path: Cell[] = [];
    let cursor: Cell | null = maze.exit.cell;
    while (cursor) {
        path.unshift(cursor);
        cursor = previous.get(id(cursor)) ?? null;
    }
    return path;
}

function timePointsAtFixedStepsFollowingDrift(points: { x: number; y: number }[]): TimedPoint[] {
    return points.map((p, i) => {
        const t = i * stepMs;
        const drift = mazeDriftAt(t);
        return { x: origin.x + p.x + drift.x, y: origin.y + p.y + drift.y, t };
    });
}

function interpolateEvery(points: { x: number; y: number }[], spacing: number) {
    const result = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing));
        for (let s = 1; s <= steps; s++) {
            result.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
        }
    }
    return result;
}

describe("generateMaze", () => {
    it.each(seeds)("connects the center cell to an exit on the outer edge (seed %i)", (seed) => {
        const maze = generateMaze(cellsPerSide, cellSize, seededRandom(seed));
        const path = solveMazeIntoCellPath(maze);
        expect(path[0]).toEqual(maze.start);
        expect(path[path.length - 1]).toEqual(maze.exit.cell);
    });
});

describe("generateMaze at the challenge size", () => {
    it.each(seeds)("connects the center of a 7 by 7 maze to an exit and accepts the corridor path (seed %i)", (seed) => {
        const maze = generateMaze(harderCellsPerSide, harderCellSize, seededRandom(seed));
        const cells = solveMazeIntoCellPath(maze);
        expect(cells[cells.length - 1]).toEqual(maze.exit.cell);
        const centers = cells.map((c) => cellCenter(maze, c));
        centers.push(exitMarkerPoint(maze, pastExitDistance));
        const path = timePointsAtFixedStepsFollowingDrift(interpolateEvery(centers, 10));
        expect(judgeLaserRun(maze, origin, path, wallTolerance)).toEqual({ kind: "escaped" });
    });
});

describe("judgeLaserRun", () => {
    it.each(seeds)("accepts a laser path that follows the corridor centers out of the exit (seed %i)", (seed) => {
        const maze = generateMaze(cellsPerSide, cellSize, seededRandom(seed));
        const centers = solveMazeIntoCellPath(maze).map((c) => cellCenter(maze, c));
        centers.push(exitMarkerPoint(maze, pastExitDistance));
        const path = timePointsAtFixedStepsFollowingDrift(interpolateEvery(centers, 10));
        expect(judgeLaserRun(maze, origin, path, wallTolerance)).toEqual({ kind: "escaped" });
    });

    it.each(seeds)("rejects a laser path that leaves through the side opposite the exit (seed %i)", (seed) => {
        const maze = generateMaze(cellsPerSide, cellSize, seededRandom(seed));
        const start = cellCenter(maze, maze.start);
        const far = cellsPerSide * cellSize + pastExitDistance;
        const target = {
            top: { x: start.x, y: far },
            bottom: { x: start.x, y: -pastExitDistance },
            left: { x: far, y: start.y },
            right: { x: -pastExitDistance, y: start.y },
        }[maze.exit.side];
        const path = timePointsAtFixedStepsFollowingDrift(interpolateEvery([start, target], 10));
        expect(judgeLaserRun(maze, origin, path, wallTolerance).kind).toBe("hit-wall");
    });

    it("rejects a laser path that starts in a corner cell instead of the center", () => {
        const maze = generateMaze(cellsPerSide, cellSize, seededRandom(7));
        const corner = cellCenter(maze, { row: 0, col: 0 });
        const path = timePointsAtFixedStepsFollowingDrift([corner, { x: corner.x + 5, y: corner.y }]);
        expect(judgeLaserRun(maze, origin, path, wallTolerance)).toEqual({
            kind: "started-outside-center",
        });
    });

    it("reports a laser path that ends inside the maze without touching a wall as stopped inside", () => {
        const maze = generateMaze(cellsPerSide, cellSize, seededRandom(9));
        const start = cellCenter(maze, maze.start);
        const path = timePointsAtFixedStepsFollowingDrift([start, { x: start.x + 10, y: start.y + 10 }]);
        expect(judgeLaserRun(maze, origin, path, wallTolerance)).toEqual({ kind: "stopped-inside" });
    });
});

describe("judgeLaserRun with an exit stretch", () => {
    function solveIntoCorridorCentersAndExitCenter(seed: number) {
        const maze = generateMaze(harderCellsPerSide, harderCellSize, seededRandom(seed));
        const centers = solveMazeIntoCellPath(maze).map((c) => cellCenter(maze, c));
        const gap = exitGap(maze);
        const mouth = { x: (gap.a.x + gap.b.x) / 2, y: (gap.a.y + gap.b.y) / 2 };
        const along = (distance: number, sideways = 0) => ({
            x: mouth.x + gap.direction.x * distance - gap.direction.y * sideways,
            y: mouth.y + gap.direction.y * distance + gap.direction.x * sideways,
        });
        return { maze, centers, along };
    }

    it.each(seeds)("does not count the run as escaped while it is still inside the stretch (seed %i)", (seed) => {
        const { maze, centers, along } = solveIntoCorridorCentersAndExitCenter(seed);
        const path = timePointsAtFixedStepsFollowingDrift(
            interpolateEvery([...centers, along(stretchLength - shortOfStretchEnd)], 10)
        );
        expect(judgeLaserRun(maze, origin, path, wallTolerance, stretchLength)).toEqual({ kind: "stopped-inside" });
    });

    it.each(seeds)("counts the run as escaped once it passes the end of the stretch (seed %i)", (seed) => {
        const { maze, centers, along } = solveIntoCorridorCentersAndExitCenter(seed);
        const path = timePointsAtFixedStepsFollowingDrift(
            interpolateEvery([...centers, along(stretchLength + pastExitDistance)], 10)
        );
        expect(judgeLaserRun(maze, origin, path, wallTolerance, stretchLength)).toEqual({ kind: "escaped" });
    });

    it.each(seeds)("reports a wall hit when the run leaves the stretch sideways (seed %i)", (seed) => {
        const { maze, centers, along } = solveIntoCorridorCentersAndExitCenter(seed);
        const path = timePointsAtFixedStepsFollowingDrift(
            interpolateEvery([...centers, along(stretchLength / 2), along(stretchLength / 2, sidewaysOffset)], 10)
        );
        expect(judgeLaserRun(maze, origin, path, wallTolerance, stretchLength).kind).toBe("hit-wall");
    });
});
