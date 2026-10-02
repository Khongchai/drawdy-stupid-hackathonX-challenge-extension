import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import { describe, expect, it } from "vitest";
import { DECOY_MIN_GAP, decoyGrid, generateDecoys } from "./decoys";
import { Rect } from "./geometry";
import { seededRandom } from "./random";
import { DECOY_COLORS } from "./theme";

const decoyCount = 9900;
const spacing = 72;
const aspect = 1.6;
const origin = { x: -800, y: 200 };
const textLineHeight = 1.4;
const rounding = 1e-6;

function boundingBoxOf(element: DrawdyElementSchema): Rect {
    const box = (xs: number[], ys: number[]) => ({
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
    });
    switch (element.type) {
        case "shape":
            return { x: element.x, y: element.y, width: element.width, height: element.height };
        case "text":
            return { x: element.x, y: element.y, width: element.fontSize, height: element.fontSize * textLineHeight };
        case "line":
        case "arrow": {
            const points = [element.from!, element.to!, ...(element.bend ?? [])];
            return box(points.map((p) => p[0]), points.map((p) => p[1]));
        }
        case "freedraw":
            return box(
                element.points.filter((_, i) => i % 2 === 0),
                element.points.filter((_, i) => i % 2 === 1)
            );
        default:
            throw new Error(`unexpected decoy type ${element.type}`);
    }
}

function generateNineThousandNineHundredDecoysWithSequentialIds(seed: number) {
    let next = 0;
    const grid = decoyGrid(decoyCount, spacing, aspect);
    const decoys = generateDecoys(decoyCount, origin, grid, seededRandom(seed), "find-rect", () => `id-${next++}`, DECOY_COLORS.light);
    return { grid, decoys };
}

describe("generateDecoys", () => {
    it("produces 9900 decoys with unique ids and no rectangle shape among them", () => {
        const { decoys } = generateNineThousandNineHundredDecoysWithSequentialIds(11);
        expect(decoys).toHaveLength(decoyCount);
        expect(new Set(decoys.map((d) => d.element.drawdyElementId)).size).toBe(decoyCount);
        const rectangles = decoys.filter(
            (d) => d.element.type === "shape" && (d.element.componentType ?? "rect") === "rect"
        );
        expect(rectangles).toEqual([]);
    });

    it("uses no text glyph that is drawn as a rectangle", () => {
        const rectangleGlyphs = ["□", "▢", "▭", "▯", "■", "▬", "▮", "▪", "▫"];
        const { decoys } = generateNineThousandNineHundredDecoysWithSequentialIds(13);
        const texts = decoys.flatMap((d) => (d.element.type === "text" ? [d.element.text] : []));
        expect(texts.filter((t) => rectangleGlyphs.includes(t))).toEqual([]);
    });

    it("keeps every decoy inside its own grid cell, at least the minimum gap away from its neighbours", () => {
        const { grid, decoys } = generateNineThousandNineHundredDecoysWithSequentialIds(5);
        decoys.forEach(({ element }, i) => {
            const inner = {
                x: origin.x + (i % grid.columns) * spacing + DECOY_MIN_GAP / 2 - rounding,
                y: origin.y + Math.floor(i / grid.columns) * spacing + DECOY_MIN_GAP / 2 - rounding,
                size: spacing - DECOY_MIN_GAP + rounding * 2,
            };
            const box = boundingBoxOf(element);
            expect(box.x).toBeGreaterThanOrEqual(inner.x);
            expect(box.y).toBeGreaterThanOrEqual(inner.y);
            expect(box.x + box.width).toBeLessThanOrEqual(inner.x + inner.size);
            expect(box.y + box.height).toBeLessThanOrEqual(inner.y + inner.size);
        });
    });
});

describe("generateDecoys square diamonds", () => {
    it("makes about half of the diamonds square so one can be turned into a rectangle", () => {
        const { decoys } = generateNineThousandNineHundredDecoysWithSequentialIds(17);
        const diamonds = decoys.flatMap((d) => (d.element.type === "shape" && d.element.componentType === "diamond" ? [d.element] : []));
        const square = diamonds.filter((d) => d.width === d.height);
        expect(square.length / diamonds.length).toBeGreaterThan(0.4);
        expect(square.length / diamonds.length).toBeLessThan(0.6);
    });
});

describe("decoyGrid", () => {
    it("has room for every decoy and is wider than tall for an aspect above one", () => {
        const grid = decoyGrid(decoyCount, spacing, aspect);
        expect(grid.columns * grid.rows).toBeGreaterThanOrEqual(decoyCount);
        expect(grid.width).toBeGreaterThan(grid.height);
    });
});
