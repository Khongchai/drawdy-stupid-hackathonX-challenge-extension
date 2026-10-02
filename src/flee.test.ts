import { describe, expect, it } from "vitest";
import { chooseEscape } from "./flee";
import { distance } from "./geometry";
import { seededRandom } from "./random";

const yard = { x: 0, y: 0, width: 1400, height: 800 };
const fleeRadius = 260;
const trials = 200;

describe("chooseEscape", () => {
    it("picks an escape point outside the flee radius of the cursor for every cursor position tried", () => {
        const random = seededRandom(3);
        for (let i = 0; i < trials; i++) {
            const cursor = { x: random() * yard.width, y: random() * yard.height };
            const from = { x: cursor.x + 40, y: cursor.y + 10 };
            const escape = chooseEscape(from, cursor, yard, fleeRadius, random);
            expect(distance(escape, cursor)).toBeGreaterThan(fleeRadius);
        }
    });

    it("keeps the escape point inside the yard when the cursor corners Diny", () => {
        const random = seededRandom(8);
        const escape = chooseEscape({ x: 5, y: 5 }, { x: 60, y: 60 }, yard, fleeRadius, random);
        expect(escape.x).toBeGreaterThanOrEqual(yard.x);
        expect(escape.y).toBeGreaterThanOrEqual(yard.y);
        expect(escape.x).toBeLessThanOrEqual(yard.x + yard.width);
        expect(escape.y).toBeLessThanOrEqual(yard.y + yard.height);
    });
});
