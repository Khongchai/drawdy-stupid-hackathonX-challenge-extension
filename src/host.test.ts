import { describe, expect, it } from "vitest";
import { newId, useIdSeed } from "./host";

const idsPerRun = 50;
const stageSeed = 123456;
const otherSeed = 654321;

function generateIdsFromSeed(seed: number): string[] {
    useIdSeed(seed);
    const ids = Array.from({ length: idsPerRun }, () => newId());
    useIdSeed(null);
    return ids;
}

describe("newId with a stage seed", () => {
    it("gives the same ids in the same order when a stage is rebuilt from its seed", () => {
        expect(generateIdsFromSeed(stageSeed)).toEqual(generateIdsFromSeed(stageSeed));
    });

    it("gives different ids for a different seed", () => {
        const first = new Set(generateIdsFromSeed(stageSeed));
        expect(generateIdsFromSeed(otherSeed).some((id) => first.has(id))).toBe(false);
    });

    it("makes 12 character letter and digit ids, like the host's own", () => {
        for (const id of generateIdsFromSeed(stageSeed)) expect(id).toMatch(/^[A-Za-z0-9]{12}$/);
    });
});
