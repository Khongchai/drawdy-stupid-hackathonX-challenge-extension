import { Point, Rect, Segment, containsPoint } from "./geometry";
import { Cell, ExitRule, MazeLayout, placeLocal, toLocal } from "./maze";
import { Random } from "./random";

export type CellBox = { minRow: number; maxRow: number; minCol: number; maxCol: number };

const SEARCH_STEP_LIMIT = 50_000;

const id = (c: Cell) => `${c.row},${c.col}`;

function neighbours(c: Cell): Cell[] {
    return [
        { row: c.row - 1, col: c.col },
        { row: c.row + 1, col: c.col },
        { row: c.row, col: c.col - 1 },
        { row: c.row, col: c.col + 1 },
    ];
}

function insideMaze(maze: MazeLayout, c: Cell): boolean {
    return c.row >= 0 && c.col >= 0 && c.row < maze.cells && c.col < maze.cells;
}

function insideBox(box: CellBox, c: Cell): boolean {
    return c.row >= box.minRow && c.row <= box.maxRow && c.col >= box.minCol && c.col <= box.maxCol;
}

export function corridorEntrance(maze: MazeLayout): Cell {
    const { row, col } = maze.exit.cell;
    switch (maze.exit.side) {
        case "top":
            return { row: row - 1, col };
        case "bottom":
            return { row: row + 1, col };
        case "left":
            return { row, col: col - 1 };
        case "right":
            return { row, col: col + 1 };
    }
}

export function generateCorridorPath(maze: MazeLayout, box: CellBox, length: number, random: Random): Cell[] {
    const start = corridorEntrance(maze);
    const path: Cell[] = [start];
    const visited = new Set([id(start)]);
    let best: Cell[] = [start];
    let steps = 0;
    const open = (c: Cell) => insideBox(box, c) && !insideMaze(maze, c) && !visited.has(id(c));
    const extend = (): boolean => {
        if (path.length >= length) return true;
        if (++steps > SEARCH_STEP_LIMIT) return false;
        const last = path[path.length - 1];
        const options = neighbours(last)
            .filter(open)
            .map((c) => ({ c, onward: neighbours(c).filter(open).length, tiebreak: random() }))
            .sort((a, b) => a.onward - b.onward || a.tiebreak - b.tiebreak);
        for (const { c } of options) {
            path.push(c);
            visited.add(id(c));
            if (path.length > best.length) best = [...path];
            if (extend()) return true;
            path.pop();
            visited.delete(id(c));
        }
        return false;
    };
    extend();
    return path.length >= length ? path : best;
}

export function cellRect(maze: MazeLayout, c: Cell): Rect {
    return { x: c.col * maze.cellSize, y: c.row * maze.cellSize, width: maze.cellSize, height: maze.cellSize };
}

function sharedSide(a: Cell, b: Cell): "top" | "bottom" | "left" | "right" | null {
    if (a.row === b.row && a.col === b.col + 1) return "left";
    if (a.row === b.row && a.col === b.col - 1) return "right";
    if (a.col === b.col && a.row === b.row + 1) return "top";
    if (a.col === b.col && a.row === b.row - 1) return "bottom";
    return null;
}

export function cellWalls(maze: MazeLayout, path: readonly Cell[], index: number): Segment[] {
    const size = maze.cellSize;
    const cell = path[index];
    const openSides = new Set<string>();
    const previous = index === 0 ? maze.exit.cell : path[index - 1];
    const fromPrevious = sharedSide(cell, previous);
    if (fromPrevious) openSides.add(fromPrevious);
    const next = path[index + 1];
    const toNext = next ? sharedSide(cell, next) : null;
    if (toNext) openSides.add(toNext);
    const x = cell.col * size;
    const y = cell.row * size;
    const edges: Record<string, Segment> = {
        top: { a: { x, y }, b: { x: x + size, y } },
        bottom: { a: { x, y: y + size }, b: { x: x + size, y: y + size } },
        left: { a: { x, y }, b: { x, y: y + size } },
        right: { a: { x: x + size, y }, b: { x: x + size, y: y + size } },
    };
    return Object.entries(edges)
        .filter(([side]) => !openSides.has(side))
        .map(([, edge]) => edge);
}

export function corridorWalls(maze: MazeLayout, path: readonly Cell[], revealed: number): Segment[] {
    const walls: Segment[] = [];
    for (let i = 0; i < revealed && i < path.length; i++) walls.push(...cellWalls(maze, path, i));
    return walls;
}

export function cellIndexAt(maze: MazeLayout, path: readonly Cell[], local: Point): number {
    const row = Math.floor(local.y / maze.cellSize);
    const col = Math.floor(local.x / maze.cellSize);
    return path.findIndex((c) => c.row === row && c.col === col);
}

export function corridorExit(
    maze: MazeLayout,
    origin: Point,
    path: readonly Cell[],
    revealed: number,
    canEscape: boolean
): ExitRule {
    const local = corridorWalls(maze, path, revealed);
    const escapeCell = path[revealed];
    return {
        walls: (tMs) => local.map((wall) => placeLocal(origin, wall, tMs)),
        escaped: (p, tMs) => canEscape && !!escapeCell && containsPoint(cellRect(maze, escapeCell), toLocal(origin, p, tMs)),
    };
}
