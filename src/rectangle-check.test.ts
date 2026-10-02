import { describe, expect, it } from "vitest";
import { Vertex, looksLikeUprightRectangle } from "./rectangle-check";

const squareDiamondSize = 40;
const stretchedDiamond = { width: 60, height: 30 };
const center = { x: 500, y: 300 };
const degrees = (d: number) => (d * Math.PI) / 180;

function diamondCornersRotatedAboutTheirCenter(width: number, height: number, radians: number): Vertex[] {
    const corners: Vertex[] = [
        [0, -height / 2],
        [width / 2, 0],
        [0, height / 2],
        [-width / 2, 0],
    ];
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return corners.map(([x, y]) => [center.x + x * cos - y * sin, center.y + x * sin + y * cos] as const);
}

describe("looksLikeUprightRectangle", () => {
    it("rejects an upright diamond", () => {
        expect(looksLikeUprightRectangle(diamondCornersRotatedAboutTheirCenter(squareDiamondSize, squareDiamondSize, 0))).toBe(false);
    });

    it.each([45, 135, -45, 225])("accepts a square diamond turned by %i degrees", (turn) => {
        expect(looksLikeUprightRectangle(diamondCornersRotatedAboutTheirCenter(squareDiamondSize, squareDiamondSize, degrees(turn)))).toBe(true);
    });

    it("accepts a square diamond turned 2 degrees short of 45", () => {
        expect(looksLikeUprightRectangle(diamondCornersRotatedAboutTheirCenter(squareDiamondSize, squareDiamondSize, degrees(43)))).toBe(true);
    });

    it("rejects a square diamond turned only 30 degrees", () => {
        expect(looksLikeUprightRectangle(diamondCornersRotatedAboutTheirCenter(squareDiamondSize, squareDiamondSize, degrees(30)))).toBe(false);
    });

    it("rejects a stretched diamond at every turn from 0 to 180 degrees", () => {
        for (let turn = 0; turn <= 180; turn++) {
            expect(
                looksLikeUprightRectangle(diamondCornersRotatedAboutTheirCenter(stretchedDiamond.width, stretchedDiamond.height, degrees(turn)))
            ).toBe(false);
        }
    });

    it("accepts the outline of a square diamond turned 45 degrees when the closing point repeats the first", () => {
        const corners = diamondCornersRotatedAboutTheirCenter(squareDiamondSize, squareDiamondSize, degrees(45));
        expect(looksLikeUprightRectangle([...corners, corners[0]])).toBe(true);
    });
});
