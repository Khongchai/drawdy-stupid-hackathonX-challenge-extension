import { describe, expect, it } from "vitest";
import { seededRandom } from "./random";
import { AnnoyanceMeter, LEVELS, LINES, MELTDOWN_LINES, TantrumEffect, TantrumKind, reactionFor } from "./tantrum-script";

const decayEveryMs = 30_000;
const quickRepeatMs = 1000;
const highestLevelTried = 20;
const kinds = Object.keys(LINES) as TantrumKind[];

describe("reactionFor", () => {
    it.each(kinds)("answers the first %s with its first plain line and no effects", (kind) => {
        expect(reactionFor(kind, 0, 0, seededRandom(1))).toEqual({
            text: LINES[kind][0],
            unhinged: false,
            effects: [],
            intensity: 0,
        });
    });

    it("never takes away an effect as the level rises, apart from the fake delete that only shows every third level", () => {
        let previous = new Set<TantrumEffect>();
        for (let level = 0; level <= highestLevelTried; level++) {
            const effects = new Set(reactionFor("wall", 0, level, seededRandom(level)).effects);
            for (const effect of previous) {
                if (effect !== "fake-delete") expect(effects.has(effect)).toBe(true);
            }
            previous = effects;
        }
    });

    it("turns on camera shake and the NO burst at their levels", () => {
        expect(reactionFor("wall", 0, LEVELS.shakeCamera, seededRandom(2)).effects).toContain("shake-camera");
        expect(reactionFor("wall", 0, LEVELS.noBurst, seededRandom(2)).effects).toContain("no-burst");
        expect(reactionFor("wall", 0, LEVELS.shakeCamera - 1, seededRandom(2)).effects).not.toContain("shake-camera");
    });

    it("switches to a meltdown line once a kind has used up its own lines", () => {
        const kind: TantrumKind = "missed-start";
        const reaction = reactionFor(kind, LINES[kind].length, 0, seededRandom(3));
        expect(MELTDOWN_LINES).toContain(reaction.text);
    });

    it("adds combining marks to the text from the mangle level on", () => {
        const plain = LINES.wall[1];
        const mangled = reactionFor("wall", 1, LEVELS.mangle + 2, seededRandom(4)).text;
        expect(mangled.length).toBeGreaterThan(plain.length);
        expect(mangled.normalize("NFD").replace(/[\u0300-\u036f]/g, "")).toBe(plain);
    });
});

describe("AnnoyanceMeter", () => {
    it("raises the level by one for each invalid action in quick succession", () => {
        const meter = new AnnoyanceMeter(decayEveryMs);
        const levels = [0, 1, 2, 3].map((i) => meter.record("wall", i * quickRepeatMs).level);
        expect(levels).toEqual([0, 1, 2, 3]);
    });

    it("lowers the level by one for every full decay period without an invalid action", () => {
        const meter = new AnnoyanceMeter(decayEveryMs);
        for (let i = 0; i < 5; i++) meter.record("wall", i * quickRepeatMs);
        const afterTwoCalmPeriods = meter.record("wall", 4 * quickRepeatMs + 2 * decayEveryMs).level;
        expect(afterTwoCalmPeriods).toBe(3);
    });

    it("lowers the level by the given steps when calmed down after a solved challenge", () => {
        const meter = new AnnoyanceMeter(decayEveryMs);
        for (let i = 0; i < 4; i++) meter.record("wall", i * quickRepeatMs);
        meter.calmDown(2);
        expect(meter.record("wall", 4 * quickRepeatMs).level).toBe(2);
    });

    it("counts each kind separately while sharing one level", () => {
        const meter = new AnnoyanceMeter(decayEveryMs);
        meter.record("wall", 0);
        meter.record("wall", quickRepeatMs);
        const first = meter.record("wrong-tool", 2 * quickRepeatMs);
        expect(first).toEqual({ level: 2, timesForKind: 0 });
    });
});
