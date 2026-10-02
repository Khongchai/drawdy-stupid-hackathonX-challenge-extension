import { StageId } from "./scene-kit";

export const ORDER: readonly StageId[] = ["intro", "sign-up", "buttons", "find-rect", "diny", "maze", "finale"];

const CHALLENGES: readonly StageId[] = ORDER.filter((id) => id !== "intro" && id !== "finale");

export const CHALLENGE_COUNT = CHALLENGES.length;

export function challengeTitle(id: StageId): string {
    return `Challenge ${CHALLENGES.indexOf(id) + 1} of ${CHALLENGE_COUNT}`;
}
