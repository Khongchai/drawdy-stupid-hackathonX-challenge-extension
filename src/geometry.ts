export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Segment = { a: Point; b: Point };

export function rectCenter(r: Rect): Point {
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function expandRect(r: Rect, margin: number): Rect {
    return {
        x: r.x - margin,
        y: r.y - margin,
        width: r.width + margin * 2,
        height: r.height + margin * 2,
    };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
    return (
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
    );
}

export function intersectionArea(a: Rect, b: Rect): number {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
}

export function overlapRatio(a: Rect, b: Rect): number {
    const smaller = Math.min(a.width * a.height, b.width * b.height);
    return smaller > 0 ? intersectionArea(a, b) / smaller : 0;
}

export function unionRect(rects: readonly Rect[]): Rect | null {
    if (rects.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of rects) {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function containsPoint(r: Rect, p: Point): boolean {
    return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceToSegment(p: Point, s: Segment): number {
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return distance(p, s.a);
    const t = Math.max(
        0,
        Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / lengthSquared)
    );
    return distance(p, { x: s.a.x + t * dx, y: s.a.y + t * dy });
}

function orientation(a: Point, b: Point, c: Point): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function segmentsIntersect(s: Segment, t: Segment): boolean {
    const d1 = orientation(t.a, t.b, s.a);
    const d2 = orientation(t.a, t.b, s.b);
    const d3 = orientation(s.a, s.b, t.a);
    const d4 = orientation(s.a, s.b, t.b);
    return (
        ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    );
}

export function distanceBetweenSegments(s: Segment, t: Segment): number {
    if (segmentsIntersect(s, t)) return 0;
    return Math.min(
        distanceToSegment(s.a, t),
        distanceToSegment(s.b, t),
        distanceToSegment(t.a, s),
        distanceToSegment(t.b, s)
    );
}

export function rotateAround(p: Point, pivot: Point, radians: number): Point {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = p.x - pivot.x;
    const dy = p.y - pivot.y;
    return {
        x: pivot.x + dx * cos - dy * sin,
        y: pivot.y + dx * sin + dy * cos,
    };
}
