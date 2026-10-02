import type { LocalAnimation } from "@drawdy/driver-protocol";
import { Random, between } from "./random";

export const FALL_KEYFRAMES = 16;
export const FALL_MAX_MS = 2200;

const FALL_MIN_MS = 1300;
const MAX_START_DELAY = 0.35;
const HOP_HEIGHT = 28;
const FADE_FROM = 0.7;

export function fallAnimation(random: Random): LocalAnimation {
    const durationMs = Math.round(between(random, FALL_MIN_MS, FALL_MAX_MS));
    const delay = between(random, 0, MAX_START_DELAY);
    const drop = between(random, 700, 1100);
    const drift = between(random, -110, 110);
    const spin = between(random, -6, 6);
    const x: number[] = [];
    const y: number[] = [];
    const rotation: number[] = [];
    const opacity: number[] = [];
    for (let k = 0; k <= FALL_KEYFRAMES; k++) {
        const progress = k / FALL_KEYFRAMES;
        const u = Math.max(0, (progress - delay) / (1 - delay));
        x.push(drift * u);
        y.push(drop * u * u - HOP_HEIGHT * 4 * u * (1 - u));
        rotation.push(spin * u * u);
        opacity.push(u < FADE_FROM ? 1 : Math.max(0, 1 - (u - FADE_FROM) / (1 - FADE_FROM)));
    }
    return {
        time: { durationMs, curve: "linear", repeat: "none" },
        animation: { transform: { x, y, rotation, opacity }, curve: "linear" },
    };
}
