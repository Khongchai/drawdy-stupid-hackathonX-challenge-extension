import type { DrawdyPreviewElementSchema } from "@drawdy/driver-protocol";
import { Point, Rect, rectCenter } from "./geometry";
import { newId, trySend } from "./host";
import { ink } from "./ink";
import { seededRandom } from "./random";
import { toast } from "./scene";
import { AnnoyanceMeter, TantrumEffect, TantrumKind, reactionFor } from "./tantrum-script";

const DECAY_EVERY_MS = 30_000;
const BURST_WORDS = ["NO", "ไม่", "NOPE", "!!!", "ผิด", "WRONG", "NO", "ไม่", "WHY", "?!"];
const BURST_MS = 1500;
const BURST_FRAME_MS = 33;
const FAKE_DELETE_STEPS: readonly (readonly [number, string])[] = [
    [0, "Deleting your board... 3%"],
    [900, "Deleting your board... 41%"],
    [1800, "Deleting your board... 99%"],
    [2900, "Kidding. Your board is fine. Probably."],
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function viewportRect(): Promise<Rect | null> {
    return (await trySend({ type: "command:camera:get-viewport-rect" }))?.rect ?? null;
}

async function shakeCamera(intensity: number): Promise<void> {
    const viewport = await viewportRect();
    if (!viewport) return;
    const amplitude = viewport.width * Math.min(0.045, 0.006 + 0.005 * intensity);
    const steps = Math.min(24, 6 + intensity * 2);
    for (let i = 0; i < steps; i++) {
        const fade = 1 - i / steps;
        await trySend({
            type: "command:camera:fly-to-rect",
            req: {
                rect: {
                    ...viewport,
                    x: viewport.x + (Math.random() * 2 - 1) * amplitude * fade,
                    y: viewport.y + (Math.random() * 2 - 1) * amplitude * fade,
                },
                flyDurationMs: 30,
                zoom: 1000,
            },
        });
        await sleep(35);
    }
    await trySend({ type: "command:camera:fly-to-rect", req: { rect: viewport, flyDurationMs: 60, zoom: 1000 } });
}

type Particle = { id: string; x: number; y: number; vx: number; vy: number; text: string; fontSize: number; color: string };

function particleSchema(p: Particle, opacity: number): DrawdyPreviewElementSchema {
    return {
        type: "text",
        drawdyElementId: p.id,
        x: p.x,
        y: p.y,
        text: p.text,
        fontSize: p.fontSize,
        color: p.color,
        opacity,
    };
}

async function burstNo(at: Point | undefined, intensity: number): Promise<void> {
    const viewport = await viewportRect();
    if (!viewport) return;
    const origin = at ?? rectCenter(viewport);
    const scale = viewport.width / 1600;
    const count = Math.min(60, 10 + intensity * 6);
    const colors = [ink("danger"), ink("warm"), ink("title")];
    const particles: Particle[] = Array.from({ length: count }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const speed = (500 + Math.random() * 900) * scale;
        return {
            id: newId(),
            x: origin.x,
            y: origin.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 500 * scale,
            text: BURST_WORDS[i % BURST_WORDS.length],
            fontSize: Math.round((22 + Math.random() * 30 + intensity * 4) * scale),
            color: colors[i % colors.length],
        };
    });
    const created = await trySend({
        type: "command:scene:create-drawdy-preview-elements",
        req: { elements: particles.map((p) => particleSchema(p, 1)) },
    });
    if (!created) return;
    const gravity = 2200 * scale;
    const startedAt = Date.now();
    let last = startedAt;
    while (Date.now() - startedAt < BURST_MS) {
        await sleep(BURST_FRAME_MS);
        const now = Date.now();
        const dt = (now - last) / 1000;
        last = now;
        const fade = Math.max(0, 1 - (now - startedAt) / BURST_MS);
        for (const p of particles) {
            p.vy += gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }
        await trySend({
            type: "command:scene:update-drawdy-preview-elements",
            req: { elements: particles.map((p) => particleSchema(p, Math.min(1, fade * 1.6))) },
        });
    }
    await trySend({ type: "command:scene:delete-drawdy-preview-elements", req: { previewIds: [created.previewId] } });
}

async function fakeDelete(): Promise<void> {
    let elapsed = 0;
    for (const [at, text] of FAKE_DELETE_STEPS) {
        await sleep(at - elapsed);
        elapsed = at;
        void toast(text, "unhinged", 2500, { shake: 2 });
    }
}

export class Tantrum {
    private meter = new AnnoyanceMeter(DECAY_EVERY_MS);
    private random = seededRandom(Date.now());
    private running = new Set<TantrumEffect>();

    react(kind: TantrumKind, at?: Point): void {
        const { level, timesForKind } = this.meter.record(kind, Date.now());
        const reaction = reactionFor(kind, timesForKind, level, this.random);
        const shake = reaction.effects.includes("shake-toast") ? reaction.intensity : 0;
        void toast(reaction.text, reaction.unhinged ? "unhinged" : "bad", 3500 + reaction.intensity * 300, { shake });
        if (reaction.effects.includes("shake-camera")) this.once("shake-camera", () => shakeCamera(reaction.intensity));
        if (reaction.effects.includes("no-burst")) this.once("no-burst", () => burstNo(at, reaction.intensity));
        if (reaction.effects.includes("fake-delete")) this.once("fake-delete", () => sleep(3600).then(fakeDelete));
    }

    calmDown(steps: number): void {
        this.meter.calmDown(steps);
    }

    private once(effect: TantrumEffect, run: () => Promise<void>): void {
        if (this.running.has(effect)) return;
        this.running.add(effect);
        void run()
            .catch(() => {})
            .finally(() => this.running.delete(effect));
    }
}
