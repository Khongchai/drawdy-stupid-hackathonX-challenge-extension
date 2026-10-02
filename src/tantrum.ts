import type { DrawdyPreviewElementSchema } from "@drawdy/driver-protocol";
import { Point, Rect, rectCenter } from "./geometry";
import { newId, trySend } from "./host";
import { ink } from "./ink";
import { seededRandom } from "./random";
import { toast } from "./scene";
import { AnnoyanceMeter, TantrumEffect, TantrumKind, reactionFor } from "./tantrum-script";

const DECAY_EVERY_MS = 30_000;
const SHOCK_WORDS = ["NO", "ไม่", "WRONG", "ผิด", "NOPE", "WHY"];
const SHOCKWAVE_MS = 700;
const SHOCKWAVE_FRAME_MS = 33;
const FLASH_DOM_ID = "shx-flash";
const FLASH_PULSES = [0.6, 0.25, 0.45, 0.15];
const FLASH_STEP_MS = 90;
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

async function punchZoom(intensity: number): Promise<void> {
    const viewport = await viewportRect();
    if (!viewport) return;
    const shrink = Math.min(0.15, 0.08 + 0.01 * intensity);
    const inner = {
        x: viewport.x + (viewport.width * shrink) / 2,
        y: viewport.y + (viewport.height * shrink) / 2,
        width: viewport.width * (1 - shrink),
        height: viewport.height * (1 - shrink),
    };
    await trySend({ type: "command:camera:fly-to-rect", req: { rect: inner, flyDurationMs: 70, zoom: 1000 } });
    await sleep(110);
    await trySend({ type: "command:camera:fly-to-rect", req: { rect: viewport, flyDurationMs: 280, zoom: 1000 } });
}

async function flash(intensity: number): Promise<void> {
    const size = await trySend({ type: "command:dom:window-size" });
    if (!size) return;
    const strength = Math.min(1, 0.5 + intensity * 0.1);
    for (const alpha of FLASH_PULSES) {
        const edge = (alpha * strength).toFixed(2);
        await trySend({
            type: "command:dom:upsert-floating-element",
            req: {
                domId: FLASH_DOM_ID,
                position: { x: 0, y: 0 },
                asPopover: false,
                schema: {
                    type: "box",
                    styles: {
                        width: [size.width, "px"],
                        height: [size.height, "px"],
                        pointerEvents: "none",
                        backgroundColor: `radial-gradient(circle, rgba(200, 0, 0, 0) 45%, rgba(200, 0, 0, ${edge}) 100%)`,
                    },
                },
            },
        });
        await sleep(FLASH_STEP_MS);
    }
    await trySend({ type: "command:dom:remove-floating-element", req: { domId: FLASH_DOM_ID } });
}

function shockwaveSchemas(
    ids: { ring: string; word: string },
    origin: Point,
    radius: number,
    word: string,
    fontSize: number,
    opacity: number
): DrawdyPreviewElementSchema[] {
    return [
        {
            type: "shape",
            componentType: "circle",
            drawdyElementId: ids.ring,
            x: origin.x - radius,
            y: origin.y - radius,
            width: radius * 2,
            height: radius * 2,
            strokeColor: ink("danger"),
            fillColor: "transparent",
            strokeWidth: Math.max(2, radius * 0.06),
            roughness: 0,
            opacity,
        },
        {
            type: "text",
            drawdyElementId: ids.word,
            x: origin.x - fontSize * word.length * 0.32,
            y: origin.y - fontSize * 0.7,
            text: word,
            fontSize,
            color: ink("danger"),
            opacity,
        },
    ];
}

async function shockwave(at: Point | undefined, intensity: number): Promise<void> {
    const viewport = await viewportRect();
    if (!viewport) return;
    const origin = at ?? rectCenter(viewport);
    const scale = viewport.width / 1600;
    const ids = { ring: newId(), word: newId() };
    const word = SHOCK_WORDS[Math.floor(Math.random() * SHOCK_WORDS.length)];
    const maxRadius = (220 + intensity * 60) * scale;
    const maxFont = (110 + intensity * 18) * scale;
    const at0 = shockwaveSchemas(ids, origin, maxRadius * 0.1, word, maxFont * 0.4, 1);
    const created = await trySend({ type: "command:scene:create-drawdy-preview-elements", req: { elements: at0 } });
    if (!created) return;
    const startedAt = Date.now();
    while (Date.now() - startedAt < SHOCKWAVE_MS) {
        await sleep(SHOCKWAVE_FRAME_MS);
        const progress = Math.min(1, (Date.now() - startedAt) / SHOCKWAVE_MS);
        const eased = 1 - (1 - progress) ** 3;
        await trySend({
            type: "command:scene:update-drawdy-preview-elements",
            req: {
                elements: shockwaveSchemas(
                    ids,
                    origin,
                    maxRadius * (0.1 + 0.9 * eased),
                    word,
                    maxFont * (0.4 + 0.6 * eased),
                    1 - progress * progress
                ),
            },
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
        const toastShake = reaction.effects.includes("shake-toast") ? reaction.intensity : 0;
        void toast(reaction.text, reaction.unhinged ? "unhinged" : "bad", 3500 + reaction.intensity * 300, { shake: toastShake });
        const shake = reaction.effects.includes("shake-camera");
        const punch = reaction.effects.includes("punch-zoom");
        if (shake || punch) {
            this.once("shake-camera", async () => {
                if (shake) await shakeCamera(reaction.intensity);
                if (punch) await punchZoom(reaction.intensity);
            });
        }
        if (reaction.effects.includes("flash")) this.once("flash", () => flash(reaction.intensity));
        if (reaction.effects.includes("shockwave")) this.once("shockwave", () => shockwave(at, reaction.intensity));
        if (reaction.effects.includes("fake-delete")) this.once("fake-delete", () => sleep(3600).then(fakeDelete));
    }

    reset(): void {
        this.meter.reset(["deleted"]);
    }

    private once(effect: TantrumEffect, run: () => Promise<void>): void {
        if (this.running.has(effect)) return;
        this.running.add(effect);
        void run()
            .catch(() => {})
            .finally(() => this.running.delete(effect));
    }
}
