export type Vertex = readonly [number, number];

export const RECTANGLE_FILL_RATIO = 0.92;

function cross(o: Vertex, a: Vertex, b: Vertex): number {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function convexHull(points: readonly Vertex[]): Vertex[] {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3) return sorted;
    const lower: Vertex[] = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper: Vertex[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function polygonArea(polygon: readonly Vertex[]): number {
    let twice = 0;
    for (let i = 0; i < polygon.length; i++) {
        const [x1, y1] = polygon[i];
        const [x2, y2] = polygon[(i + 1) % polygon.length];
        twice += x1 * y2 - x2 * y1;
    }
    return Math.abs(twice) / 2;
}

export function looksLikeUprightRectangle(points: readonly Vertex[]): boolean {
    const hull = convexHull(points);
    if (hull.length < 4) return false;
    const xs = hull.map((p) => p[0]);
    const ys = hull.map((p) => p[1]);
    const boxArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (boxArea <= 0) return false;
    return polygonArea(hull) / boxArea >= RECTANGLE_FILL_RATIO;
}
