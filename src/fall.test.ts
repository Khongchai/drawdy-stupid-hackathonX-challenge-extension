import { describe, expect, it } from "vitest";
import { FALL_KEYFRAMES, FALL_MAX_MS, fallAnimation } from "./fall";
import { seededRandom } from "./random";

const samples = 200;
const keyframeCount = FALL_KEYFRAMES + 1;

describe("fallAnimation", () => {
    it("starts every track at rest and ends fully faded below the start point", () => {
        const random = seededRandom(21);
        for (let i = 0; i < samples; i++) {
            const { transform } = fallAnimation(random).animation;
            expect(transform.y![0]).toBeCloseTo(0);
            expect(transform.x![0]).toBeCloseTo(0);
            expect(transform.opacity![0]).toBe(1);
            expect(transform.opacity![keyframeCount - 1]).toBe(0);
            expect(transform.y![keyframeCount - 1]).toBeGreaterThan(600);
        }
    });

    it("gives every track the same number of keyframes and plays once within the maximum duration", () => {
        const random = seededRandom(4);
        for (let i = 0; i < samples; i++) {
            const animation = fallAnimation(random);
            for (const track of [animation.animation.transform.x, animation.animation.transform.y, animation.animation.transform.rotation, animation.animation.transform.opacity]) {
                expect(track).toHaveLength(keyframeCount);
            }
            expect(animation.time.repeat).toBe("none");
            expect(animation.time.durationMs).toBeLessThanOrEqual(FALL_MAX_MS);
        }
    });

    it("drops faster near the end than near the start, like gravity", () => {
        const { transform } = fallAnimation(seededRandom(9)).animation;
        const y = transform.y!;
        const lastStep = y[keyframeCount - 1] - y[keyframeCount - 2];
        const firstFallingStep = y.findIndex((v, i) => i > 0 && v > y[i - 1]);
        expect(lastStep).toBeGreaterThan(y[firstFallingStep] - y[firstFallingStep - 1]);
    });
});
