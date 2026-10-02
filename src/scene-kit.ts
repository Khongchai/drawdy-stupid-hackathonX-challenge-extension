import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import { Point, Rect } from "./geometry";
import { newId } from "./host";
import { ink, trackInk } from "./ink";
import { BUTTON, InkToken, XP } from "./theme";

export type StageId = "intro" | "sign-up" | "buttons" | "find-rect" | "diny" | "maze" | "finale";

export const META_KEY = "stupidHackathonX";

export type StageAnchor = { seed: number; region: Rect; error: string | null };

export type ElementTag = { stage: StageId; role: string; anchor?: StageAnchor };

export function tag(stage: StageId, role: string, anchor?: StageAnchor): Record<string, unknown> {
    return { [META_KEY]: anchor ? { stage, role, anchor } : { stage, role } };
}

function isAnchor(value: unknown): value is StageAnchor {
    const a = value as Partial<StageAnchor> | undefined;
    const r = a?.region as Partial<Rect> | undefined;
    return (
        typeof a?.seed === "number" &&
        typeof r?.x === "number" &&
        typeof r?.y === "number" &&
        typeof r?.width === "number" &&
        typeof r?.height === "number" &&
        (a.error === null || typeof a.error === "string")
    );
}

export function readTag(meta: Record<string, unknown> | undefined): ElementTag | null {
    const value = meta?.[META_KEY] as Partial<ElementTag> | undefined;
    if (!value || typeof value.stage !== "string" || typeof value.role !== "string") return null;
    return isAnchor(value.anchor)
        ? { stage: value.stage as StageId, role: value.role, anchor: value.anchor }
        : { stage: value.stage as StageId, role: value.role };
}

export type Built = { elements: DrawdyElementSchema[]; ids: string[] };

export type TextColor = { color: string; ink?: never } | { ink: InkToken; color?: never };

export function textLine(
    opts: {
        stage: StageId;
        role: string;
        x: number;
        y: number;
        text: string;
        fontSize: number;
        width?: number;
        textAlign?: "left" | "center" | "right";
        anchor?: StageAnchor;
    } & TextColor
): DrawdyElementSchema {
    const drawdyElementId = newId();
    if (opts.ink) trackInk(drawdyElementId, opts.ink);
    return {
        type: "text",
        drawdyElementId,
        x: opts.x,
        y: opts.y,
        width: opts.width,
        text: opts.text,
        fontSize: opts.fontSize,
        color: opts.ink ? ink(opts.ink) : opts.color!,
        textAlign: opts.textAlign,
        meta: tag(opts.stage, opts.role, opts.anchor),
    };
}

export function textBlock(
    opts: {
        stage: StageId;
        role: string;
        x: number;
        y: number;
        lines: readonly string[];
        fontSize: number;
        lineHeight?: number;
        width?: number;
        textAlign?: "left" | "center" | "right";
    } & TextColor
): DrawdyElementSchema[] {
    const { lines, lineHeight, ...rest } = opts;
    const step = lineHeight ?? opts.fontSize * 1.45;
    return lines.map((text, i) => textLine({ ...rest, y: opts.y + i * step, text } as Parameters<typeof textLine>[0]));
}

export function xpWindow(opts: {
    stage: StageId;
    role: string;
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    anchor?: StageAnchor;
}): Built {
    const titleBarHeight = 46;
    const body: DrawdyElementSchema = {
        type: "shape",
        componentType: "rect",
        drawdyElementId: newId(),
        x: opts.x,
        y: opts.y,
        width: opts.width,
        height: opts.height,
        strokeColor: XP.taskbarBlue,
        fillColor: XP.dialogBody,
        strokeWidth: 4,
        cornerRadius: 10,
        roughness: 0,
        fillStyle: "solid",
        meta: tag(opts.stage, `${opts.role}:body`, opts.anchor),
    };
    const titleBar: DrawdyElementSchema = {
        type: "shape",
        componentType: "rect",
        drawdyElementId: newId(),
        x: opts.x,
        y: opts.y,
        width: opts.width,
        height: titleBarHeight,
        strokeColor: XP.taskbarBlue,
        fillColor: XP.taskbarBlue,
        strokeWidth: 4,
        cornerRadius: 10,
        roughness: 0,
        fillStyle: "solid",
        text: `  ${opts.title}`,
        fontSize: 20,
        textAlign: "left",
        textVerticalAlign: "middle",
        textColor: XP.white,
        meta: tag(opts.stage, `${opts.role}:title-bar`),
    };
    const close: DrawdyElementSchema = {
        type: "shape",
        componentType: "rect",
        drawdyElementId: newId(),
        x: opts.x + opts.width - 40,
        y: opts.y + 8,
        width: 30,
        height: 30,
        strokeColor: XP.white,
        fillColor: BUTTON.close,
        strokeWidth: 2,
        cornerRadius: 5,
        roughness: 0,
        fillStyle: "solid",
        text: "X",
        fontSize: 16,
        textColor: XP.white,
        meta: tag(opts.stage, `${opts.role}:close`),
    };
    const elements = [body, titleBar, close];
    return { elements, ids: elements.map((e) => e.drawdyElementId) };
}

export type PushButton = Built & { faceId: string; groupId: string };

export function pushButton(opts: {
    stage: StageId;
    role: string;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    face: string;
    edge: string;
    textColor: string;
    fontSize?: number;
}): PushButton {
    const groupId = newId();
    const depth = 9;
    const base: DrawdyElementSchema = {
        type: "shape",
        componentType: "rect",
        drawdyElementId: newId(),
        x: opts.x,
        y: opts.y + depth,
        width: opts.width,
        height: opts.height,
        strokeColor: opts.edge,
        fillColor: opts.edge,
        strokeWidth: 3,
        cornerRadius: 18,
        roughness: 0,
        fillStyle: "solid",
        groupId,
        meta: tag(opts.stage, `${opts.role}:base`),
    };
    const face: DrawdyElementSchema = {
        type: "shape",
        componentType: "rect",
        drawdyElementId: newId(),
        x: opts.x,
        y: opts.y,
        width: opts.width,
        height: opts.height,
        strokeColor: opts.edge,
        fillColor: opts.face,
        strokeWidth: 3,
        cornerRadius: 18,
        roughness: 0,
        fillStyle: "solid",
        text: opts.label,
        fontSize: opts.fontSize ?? 26,
        textAlign: "center",
        textVerticalAlign: "middle",
        textColor: opts.textColor,
        groupId,
        meta: tag(opts.stage, `${opts.role}:face`),
    };
    return {
        elements: [base, face],
        ids: [base.drawdyElementId, face.drawdyElementId],
        faceId: face.drawdyElementId,
        groupId,
    };
}

export function roundButton(opts: {
    stage: StageId;
    role: string;
    center: Point;
    radius: number;
    label: string;
    face?: string;
    edge?: string;
}): PushButton {
    const groupId = newId();
    const size = opts.radius * 2;
    const edge = opts.edge ?? BUTTON.go.edge;
    const base: DrawdyElementSchema = {
        type: "shape",
        componentType: "circle",
        drawdyElementId: newId(),
        x: opts.center.x - opts.radius,
        y: opts.center.y - opts.radius + 8,
        width: size,
        height: size,
        strokeColor: edge,
        fillColor: edge,
        strokeWidth: 3,
        roughness: 0,
        fillStyle: "solid",
        groupId,
        meta: tag(opts.stage, `${opts.role}:base`),
    };
    const face: DrawdyElementSchema = {
        type: "shape",
        componentType: "circle",
        drawdyElementId: newId(),
        x: opts.center.x - opts.radius,
        y: opts.center.y - opts.radius,
        width: size,
        height: size,
        strokeColor: edge,
        fillColor: opts.face ?? BUTTON.go.face,
        strokeWidth: 3,
        roughness: 0,
        fillStyle: "solid",
        text: opts.label,
        fontSize: Math.round(opts.radius * 0.36),
        textAlign: "center",
        textVerticalAlign: "middle",
        textColor: XP.white,
        groupId,
        meta: tag(opts.stage, `${opts.role}:face`),
    };
    return {
        elements: [base, face],
        ids: [base.drawdyElementId, face.drawdyElementId],
        faceId: face.drawdyElementId,
        groupId,
    };
}
