import type {
    DomElementSchema,
    DrawdyElementSchema,
    LocalAnimation,
    UpdateableProperties,
} from "@drawdy/driver-protocol";
import { Rect, expandRect, rectCenter, rectsIntersect, unionRect } from "./geometry";
import { send, trySend } from "./host";
import { forgetInk, inkUpdates, setTheme } from "./ink";
import { BUTTON, Theme } from "./theme";
import { StageAnchor, StageId, readTag } from "./scene-kit";
import { XP } from "./theme";

const ADD_BATCH = 500;
const UPDATE_BATCH = 1000;
const REGION_MARGIN = 260;
const SEARCH_RINGS = 14;
const TOAST_DOM_ID = "shx-toast";

const roleById = new Map<string, string>();
let reconcile: { existing: Set<string>; seen: Set<string> } | null = null;

export function beginReconcile(existing: Iterable<string>): void {
    reconcile = { existing: new Set(existing), seen: new Set() };
}

export function endReconcile(): Set<string> {
    const seen = reconcile?.seen ?? new Set<string>();
    reconcile = null;
    return seen;
}

export function reconcilingCount(): number {
    return reconcile?.existing.size ?? 0;
}
const removedByDriver = new Set<string>();

export function roleOf(id: string): string | undefined {
    return roleById.get(id);
}

export function consumeDriverRemoval(id: string): boolean {
    return removedByDriver.delete(id);
}

export async function addElements(
    elements: readonly DrawdyElementSchema[],
    onProgress?: (added: number) => void
): Promise<void> {
    for (const element of elements) {
        const role = readTag(element.meta)?.role;
        if (role) roleById.set(element.drawdyElementId, role);
        reconcile?.seen.add(element.drawdyElementId);
    }
    const missing = reconcile ? elements.filter((e) => !reconcile!.existing.has(e.drawdyElementId)) : elements;
    for (let i = 0; i < missing.length; i += ADD_BATCH) {
        await send({
            type: "command:scene:add-drawdy-elements",
            req: { elements: missing.slice(i, i + ADD_BATCH) },
        });
        onProgress?.(Math.min(i + ADD_BATCH, missing.length));
    }
}

export async function removeElements(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) removedByDriver.add(id);
    await trySend({
        type: "command:scene:remove-drawdy-elements",
        req: { drawdyElementIds: [...ids] },
    });
    for (const id of ids) {
        roleById.delete(id);
        forgetInk(id);
    }
}

export async function applyTheme(next: Theme): Promise<void> {
    if (!setTheme(next)) return;
    await updateElements(inkUpdates());
}

export async function updateElements(
    updates: { drawdyElementId: string; properties: UpdateableProperties }[]
): Promise<void> {
    for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
        await trySend({
            type: "command:scene:update-drawdy-elements",
            req: { updates: updates.slice(i, i + UPDATE_BATCH) },
        });
    }
}

export async function updateElement(drawdyElementId: string, properties: UpdateableProperties): Promise<void> {
    await updateElements([{ drawdyElementId, properties }]);
}

export function fadeOutAnimation(index: number, durationMs: number): LocalAnimation {
    const swing = ((index * 7919) % 100) / 100 - 0.5;
    return {
        time: { durationMs, curve: "ease-in-out", repeat: "none" },
        animation: {
            transform: {
                opacity: [1, 0],
                y: [0, 140 + Math.abs(swing) * 120],
                x: [0, swing * 160],
                width: [1, 0.6],
                height: [1, 0.6],
                rotation: [0, swing * 1.2],
            },
            curve: "linear",
        },
    };
}

export async function restartAnimation(
    updates: { drawdyElementId: string; localAnimation: LocalAnimation }[]
): Promise<void> {
    await updateElements(updates.map(({ drawdyElementId }) => ({ drawdyElementId, properties: { localAnimation: null } })));
    await updateElements(
        updates.map(({ drawdyElementId, localAnimation }) => ({ drawdyElementId, properties: { localAnimation } }))
    );
}

export async function playThenRemove(
    ids: readonly string[],
    animationFor: (index: number) => LocalAnimation,
    durationMs: number
): Promise<void> {
    if (ids.length === 0) return;
    await restartAnimation(ids.map((drawdyElementId, i) => ({ drawdyElementId, localAnimation: animationFor(i) })));
    await new Promise((resolve) => setTimeout(resolve, durationMs + 50));
    await removeElements(ids);
}

export async function animateOutAndRemove(ids: readonly string[], durationMs = 800): Promise<void> {
    await playThenRemove(ids, (i) => fadeOutAnimation(i, durationMs), durationMs);
}

export async function elementRects(ids: readonly string[]): Promise<Map<string, Rect>> {
    const result = new Map<string, Rect>();
    if (ids.length === 0) return result;
    const value = await trySend({
        type: "command:scene:element-rects",
        req: { drawdyElementIds: [...ids] },
    });
    for (const entry of value?.rects ?? []) result.set(entry.drawdyElementId, entry.rect);
    return result;
}

export async function existingIds(ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const value = await send({
        type: "command:scene:get-drawdy-elements",
        req: { properties: [], drawdyElementIds: [...ids] },
    });
    return new Set(value.drawdyElements.map((e) => e.id));
}

export type TaggedScan = {
    ids: string[];
    stages: Set<StageId>;
    anchors: { stage: StageId; anchor: StageAnchor }[];
};

export async function scanTaggedElements(): Promise<TaggedScan> {
    const value = await send({
        type: "command:scene:get-drawdy-elements",
        req: { properties: ["meta"] },
    });
    const scan: TaggedScan = { ids: [], stages: new Set(), anchors: [] };
    for (const element of value.drawdyElements) {
        const found = readTag(element.meta as Record<string, unknown> | undefined);
        if (!found) continue;
        scan.stages.add(found.stage);
        scan.ids.push(element.id);
        if (found.anchor) scan.anchors.push({ stage: found.stage, anchor: found.anchor });
    }
    return scan;
}

export async function countElements(): Promise<number> {
    const value = await send({ type: "command:scene:get-drawdy-elements", req: { properties: [] } });
    return value.drawdyElements.length;
}

function regionCandidates(center: { x: number; y: number }, size: { width: number; height: number }) {
    const step = Math.max(size.width, size.height) * 0.55;
    const candidates: Rect[] = [];
    for (let ring = 0; ring <= SEARCH_RINGS; ring++) {
        const count = ring === 0 ? 1 : ring * 8;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            candidates.push({
                x: center.x + Math.cos(angle) * ring * step - size.width / 2,
                y: center.y + Math.sin(angle) * ring * step - size.height / 2,
                width: size.width,
                height: size.height,
            });
        }
    }
    return candidates;
}

export async function findEmptyRegion(size: { width: number; height: number }): Promise<Rect> {
    const viewport = (await send({ type: "command:camera:get-viewport-rect" })).rect;
    const all = await send({ type: "command:scene:get-drawdy-elements", req: { properties: [] } });
    const rects = [...(await elementRects(all.drawdyElements.map((e) => e.id))).values()];
    const center = rectCenter(viewport);
    for (const candidate of regionCandidates(center, size)) {
        const padded = expandRect(candidate, REGION_MARGIN);
        if (!rects.some((r) => rectsIntersect(padded, r))) return candidate;
    }
    const used = unionRect(rects) ?? viewport;
    return {
        x: used.x + used.width + REGION_MARGIN * 2,
        y: center.y - size.height / 2,
        width: size.width,
        height: size.height,
    };
}

export async function flyTo(region: Rect, flyDurationMs = 1000): Promise<void> {
    await trySend({
        type: "command:camera:fly-to-rect",
        req: { rect: expandRect(region, 60), flyDurationMs, zoom: 1 },
    });
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastShakeRun = 0;

export type ToastTone = "info" | "good" | "bad" | "unhinged";

const UNHINGED_TITLES = ["!!!", "NO.", "AAAAA", "WHY", "ERROR ERROR", "ไม่", "STOP"];

const TOAST_STYLES: Record<ToastTone, { title: () => string; titleColor: string; textColor: string; background: string }> = {
    info: { title: () => "Stupid Hackathon X", titleColor: XP.titleNavy, textColor: XP.ink, background: XP.tooltip },
    good: { title: () => "Nice.", titleColor: XP.deepGrass, textColor: XP.ink, background: XP.tooltip },
    bad: { title: () => "Nope.", titleColor: BUTTON.close, textColor: XP.ink, background: XP.tooltip },
    unhinged: {
        title: () => UNHINGED_TITLES[Math.floor(Math.random() * UNHINGED_TITLES.length)],
        titleColor: XP.tooltip,
        textColor: XP.white,
        background: BUTTON.close,
    },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function shakeToast(base: { x: number; y: number }, intensity: number): Promise<void> {
    const run = ++toastShakeRun;
    const amplitude = 4 + intensity * 3;
    const steps = 10 + intensity * 3;
    for (let i = 0; i < steps && run === toastShakeRun; i++) {
        const fade = 1 - i / steps;
        await trySend({
            type: "command:dom:move-floating-element",
            req: {
                domId: TOAST_DOM_ID,
                position: {
                    x: base.x + (Math.random() * 2 - 1) * amplitude * fade,
                    y: base.y + (Math.random() * 2 - 1) * amplitude * fade,
                },
            },
        });
        await sleep(30);
    }
    if (run === toastShakeRun) {
        await trySend({ type: "command:dom:move-floating-element", req: { domId: TOAST_DOM_ID, position: base } });
    }
}

export async function toast(
    text: string,
    tone: ToastTone = "info",
    durationMs = 3200,
    options: { shake?: number } = {}
): Promise<void> {
    const size = await trySend({ type: "command:dom:window-size" });
    const windowWidth = size?.width ?? 1200;
    const boxWidth = Math.min(520, windowWidth - 32);
    const style = TOAST_STYLES[tone];
    const schema: DomElementSchema = {
        type: "column",
        styles: {
            width: [boxWidth, "px"],
            backgroundColor: style.background,
            borderColor: XP.ink,
            borderWidth: [tone === "unhinged" ? 3 : 1, "px"],
            borderType: "solid",
            borderRadius: [8, "px"],
            padding: [12, "px"],
            pointerEvents: "none",
            gap: 4,
        },
        children: [
            {
                type: "text",
                child: style.title(),
                styles: { fontWeight: "bold", fontSize: [tone === "unhinged" ? 18 : 14, "px"], color: style.titleColor },
            },
            { type: "text", child: text, styles: { fontSize: [tone === "unhinged" ? 18 : 15, "px"], color: style.textColor } },
        ],
    };
    const position = { x: (windowWidth - boxWidth) / 2, y: 76 };
    await trySend({
        type: "command:dom:upsert-floating-element",
        req: { domId: TOAST_DOM_ID, position, schema, asPopover: false },
    });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastTimer = null;
        toastShakeRun++;
        void trySend({ type: "command:dom:remove-floating-element", req: { domId: TOAST_DOM_ID } });
    }, durationMs);
    if (options.shake) void shakeToast(position, options.shake);
    else toastShakeRun++;
}
