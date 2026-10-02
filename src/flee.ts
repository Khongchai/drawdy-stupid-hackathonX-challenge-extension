import { Point, Rect, distance, distanceToSegment } from "./geometry";
import { Random } from "./random";

export type FleeConfig = {
    candidates: number;
    pathClearance: number;
};

export const DEFAULT_FLEE: FleeConfig = { candidates: 32, pathClearance: 1.1 };

export function insetRect(r: Rect, inset: number): Rect {
    return { x: r.x + inset, y: r.y + inset, width: Math.max(0, r.width - inset * 2), height: Math.max(0, r.height - inset * 2) };
}

export function clampToRect(p: Point, r: Rect): Point {
    return {
        x: Math.min(r.x + r.width, Math.max(r.x, p.x)),
        y: Math.min(r.y + r.height, Math.max(r.y, p.y)),
    };
}

export function randomPointIn(r: Rect, random: Random): Point {
    return { x: r.x + random() * r.width, y: r.y + random() * r.height };
}

export function chooseEscape(
    from: Point,
    cursor: Point,
    area: Rect,
    radius: number,
    random: Random,
    config: FleeConfig = DEFAULT_FLEE
): Point {
    let best = clampToRect(from, area);
    let bestScore = -Infinity;
    for (let i = 0; i < config.candidates; i++) {
        const candidate = randomPointIn(area, random);
        const away = distance(candidate, cursor);
        const pathGap = distanceToSegment(cursor, { a: from, b: candidate });
        const crossesCursor = pathGap < radius * config.pathClearance;
        const score = away - (crossesCursor ? radius * 4 : 0) - distance(candidate, from) * 0.15;
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
}
