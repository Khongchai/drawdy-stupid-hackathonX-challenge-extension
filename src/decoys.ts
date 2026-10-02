import type { DrawdyElementSchema, FillStyle } from "@drawdy/driver-protocol";
import { Rect } from "./geometry";
import { Random, between, pick, weightedPick } from "./random";
import { StageId, tag } from "./scene-kit";

export type DecoyKind = "circle" | "diamond" | "line" | "arrow" | "squiggle" | "glyph";

const GLYPHS = ["○", "◇", "△", "☆", "♡", "✿", "◎", "⬡", "✦", "◆", "●", "★"] as const;
const FILL_STYLES: readonly FillStyle[] = ["solid", "solid", "hachure", "cross-hatch"];

const KIND_WEIGHTS: readonly (readonly [DecoyKind, number])[] = [
    ["circle", 34],
    ["diamond", 24],
    ["line", 10],
    ["arrow", 8],
    ["squiggle", 6],
    ["glyph", 15],
];

export type Decoy = { element: DrawdyElementSchema; kind: DecoyKind };

export type DecoyGrid = { columns: number; rows: number; spacing: number; width: number; height: number };

export const DECOY_MIN_GAP = 28;

export function decoyGrid(count: number, spacing: number, aspect: number): DecoyGrid {
    const columns = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
    const rows = Math.max(1, Math.ceil(count / columns));
    return { columns, rows, spacing, width: columns * spacing, height: rows * spacing };
}

function decoy(
    kind: DecoyKind,
    id: string,
    cell: Rect,
    random: Random,
    stage: StageId,
    colors: readonly string[]
): DrawdyElementSchema {
    const color = pick(random, colors);
    const footprint = cell.width - DECOY_MIN_GAP;
    const left = cell.x + DECOY_MIN_GAP / 2;
    const top = cell.y + DECOY_MIN_GAP / 2;
    const cx = left + footprint / 2;
    const cy = top + footprint / 2;
    const meta = tag(stage, `decoy:${kind}`);
    const roughness = random() < 0.6 ? 0 : between(random, 0.5, 2);
    switch (kind) {
        case "circle":
        case "diamond": {
            const width = between(random, footprint * 0.35, footprint);
            const height = kind === "diamond" ? between(random, footprint * 0.35, footprint) : width;
            return {
                type: "shape",
                componentType: kind,
                drawdyElementId: id,
                x: left + random() * (footprint - width),
                y: top + random() * (footprint - height),
                width,
                height,
                strokeColor: pick(random, colors),
                fillColor: color,
                strokeWidth: between(random, 1, 3),
                fillStyle: pick(random, FILL_STYLES),
                roughness,
                opacity: between(random, 0.7, 1),
                meta,
            };
        }
        case "line":
        case "arrow": {
            const half = between(random, footprint * 0.25, footprint * 0.45);
            const angle = between(random, 0, Math.PI * 2);
            const dx = Math.cos(angle) * half;
            const dy = Math.sin(angle) * half;
            const bendOffset = between(random, -0.4, 0.4) * half;
            return {
                type: kind,
                drawdyElementId: id,
                from: [cx - dx, cy - dy],
                to: [cx + dx, cy + dy],
                bend: [[cx - Math.sin(angle) * bendOffset, cy + Math.cos(angle) * bendOffset]],
                color,
                strokeWidth: between(random, 2, 4),
                roughness,
                meta,
            };
        }
        case "squiggle": {
            const points: number[] = [];
            const turns = 4 + Math.floor(random() * 5);
            const amplitude = between(random, footprint * 0.05, footprint * 0.12);
            const span = between(random, footprint * 0.45, footprint * 0.85);
            const angle = between(random, 0, Math.PI * 2);
            const ux = Math.cos(angle);
            const uy = Math.sin(angle);
            for (let i = 0; i <= turns * 4; i++) {
                const along = (i / (turns * 4) - 0.5) * span;
                const across = Math.sin((i / 4) * Math.PI) * amplitude;
                points.push(cx + ux * along - uy * across, cy + uy * along + ux * across);
            }
            return {
                type: "freedraw",
                drawdyElementId: id,
                points,
                width: span,
                height: amplitude * 2,
                spline: true,
                strokeColor: color,
                strokeWidth: between(random, 2, 4),
                meta,
            };
        }
        case "glyph": {
            const fontSize = Math.round(between(random, footprint * 0.35, footprint / 1.4));
            return {
                type: "text",
                drawdyElementId: id,
                x: left + random() * (footprint - fontSize),
                y: top + random() * (footprint - fontSize * 1.4),
                text: pick(random, GLYPHS),
                fontSize,
                color,
                meta,
            };
        }
    }
}

export function generateDecoys(
    count: number,
    origin: { x: number; y: number },
    grid: DecoyGrid,
    random: Random,
    stage: StageId,
    makeId: () => string,
    colors: readonly string[]
): Decoy[] {
    const result: Decoy[] = [];
    for (let i = 0; i < count; i++) {
        const cell = {
            x: origin.x + (i % grid.columns) * grid.spacing,
            y: origin.y + Math.floor(i / grid.columns) * grid.spacing,
            width: grid.spacing,
            height: grid.spacing,
        };
        const kind = weightedPick(random, KIND_WEIGHTS);
        result.push({ kind, element: decoy(kind, makeId(), cell, random, stage, colors) });
    }
    return result;
}
