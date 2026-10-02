import type {
    DomElementSchema,
    DrawdyElementSchema,
    LocalAnimation,
    UpdateableProperties,
} from "@drawdy/driver-protocol";
import { Rect, expandRect, rectCenter, rectsIntersect, unionRect } from "./geometry";
import { send, trySend } from "./host";
import { StageId, readTag } from "./scene-kit";
import { XP } from "./theme";

const ADD_BATCH = 500;
const UPDATE_BATCH = 1000;
const REGION_MARGIN = 260;
const SEARCH_RINGS = 14;
const TOAST_DOM_ID = "shx-toast";

const roleById = new Map<string, string>();
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
    }
    for (let i = 0; i < elements.length; i += ADD_BATCH) {
        await send({
            type: "command:scene:add-drawdy-elements",
            req: { elements: elements.slice(i, i + ADD_BATCH) },
        });
        onProgress?.(Math.min(i + ADD_BATCH, elements.length));
    }
}

export async function removeElements(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) removedByDriver.add(id);
    await trySend({
        type: "command:scene:remove-drawdy-elements",
        req: { drawdyElementIds: [...ids] },
    });
    for (const id of ids) roleById.delete(id);
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

export async function animateOutAndRemove(ids: readonly string[], durationMs = 800): Promise<void> {
    if (ids.length === 0) return;
    await restartAnimation(
        ids.map((drawdyElementId, i) => ({ drawdyElementId, localAnimation: fadeOutAnimation(i, durationMs) }))
    );
    await new Promise((resolve) => setTimeout(resolve, durationMs + 50));
    await removeElements(ids);
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

export async function removeTaggedElements(): Promise<Set<StageId>> {
    const value = await send({
        type: "command:scene:get-drawdy-elements",
        req: { properties: ["meta"] },
    });
    const stages = new Set<StageId>();
    const ids: string[] = [];
    for (const element of value.drawdyElements) {
        const found = readTag(element.meta as Record<string, unknown> | undefined);
        if (!found) continue;
        stages.add(found.stage);
        ids.push(element.id);
    }
    await removeElements(ids);
    return stages;
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

export type ToastTone = "info" | "good" | "bad";

const TOAST_TITLES: Record<ToastTone, { title: string; color: string }> = {
    info: { title: "Stupid Hackathon X", color: XP.titleNavy },
    good: { title: "Nice.", color: XP.deepGrass },
    bad: { title: "Nope.", color: XP.closeRed },
};

export async function toast(text: string, tone: ToastTone = "info", durationMs = 3200): Promise<void> {
    const size = await trySend({ type: "command:dom:window-size" });
    const windowWidth = size?.width ?? 1200;
    const boxWidth = Math.min(520, windowWidth - 32);
    const schema: DomElementSchema = {
        type: "column",
        styles: {
            width: [boxWidth, "px"],
            backgroundColor: XP.tooltip,
            borderColor: XP.ink,
            borderWidth: [1, "px"],
            borderType: "solid",
            borderRadius: [8, "px"],
            padding: [12, "px"],
            pointerEvents: "none",
            gap: 4,
        },
        children: [
            {
                type: "text",
                child: TOAST_TITLES[tone].title,
                styles: { fontWeight: "bold", fontSize: [14, "px"], color: TOAST_TITLES[tone].color },
            },
            { type: "text", child: text, styles: { fontSize: [15, "px"], color: XP.ink } },
        ],
    };
    await trySend({
        type: "command:dom:upsert-floating-element",
        req: {
            domId: TOAST_DOM_ID,
            position: { x: (windowWidth - boxWidth) / 2, y: 76 },
            schema,
            asPopover: false,
        },
    });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastTimer = null;
        void trySend({ type: "command:dom:remove-floating-element", req: { domId: TOAST_DOM_ID } });
    }, durationMs);
}
