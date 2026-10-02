import { describe, expect, it } from "vitest";
import { generateDecoys } from "./decoys";
import { seededRandom } from "./random";
import { DECOY_COLORS } from "./theme";

const decoyCount = 8000;
const field = { x: -800, y: 200, width: 1560, height: 810 };

describe("generateDecoys", () => {
    it("produces 8000 decoys with unique ids and no rectangle shape among them", () => {
        let next = 0;
        const decoys = generateDecoys(decoyCount, field, seededRandom(11), "find-rect", () => `id-${next++}`, DECOY_COLORS.light);
        expect(decoys).toHaveLength(decoyCount);
        expect(new Set(decoys.map((d) => d.element.drawdyElementId)).size).toBe(decoyCount);
        const rectangles = decoys.filter(
            (d) => d.element.type === "shape" && (d.element.componentType ?? "rect") === "rect"
        );
        expect(rectangles).toEqual([]);
    });

    it("places every shape and text decoy origin inside the field", () => {
        let next = 0;
        const decoys = generateDecoys(decoyCount, field, seededRandom(5), "find-rect", () => `id-${next++}`, DECOY_COLORS.light);
        for (const { element } of decoys) {
            if (element.type !== "shape" && element.type !== "text") continue;
            expect(element.x).toBeGreaterThanOrEqual(field.x);
            expect(element.x).toBeLessThanOrEqual(field.x + field.width);
            expect(element.y).toBeGreaterThanOrEqual(field.y);
            expect(element.y).toBeLessThanOrEqual(field.y + field.height);
        }
    });
});
