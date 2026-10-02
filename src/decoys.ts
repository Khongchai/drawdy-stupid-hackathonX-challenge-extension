import type { DrawdyElementSchema, FillStyle } from "@drawdy/driver-protocol";
import { Rect } from "./geometry";
import { Random, between, pick, weightedPick } from "./random";
import { StageId, tag } from "./scene-kit";
import { DECOY_COLORS } from "./theme";

export type DecoyKind = "circle" | "diamond" | "line" | "arrow" | "squiggle" | "glyph" | "box-glyph";

const GLYPHS = ["○", "◇", "△", "☆", "♡", "✿", "◎", "⬡", "✦", "◆", "●", "★"] as const;
const BOX_GLYPHS = ["□", "▢", "▭", "▯", "■"] as const;
const FILL_STYLES: readonly FillStyle[] = ["solid", "solid", "hachure", "cross-hatch"];

const KIND_WEIGHTS: readonly (readonly [DecoyKind, number])[] = [
    ["circle", 34],
    ["diamond", 24],
    ["line", 10],
    ["arrow", 8],
    ["squiggle", 6],
    ["glyph", 15],
    ["box-glyph", 3],
];

export type Decoy = { element: DrawdyElementSchema; kind: DecoyKind };

function decoy(
    kind: DecoyKind,
    id: string,
    field: Rect,
    random: Random,
    stage: StageId
): DrawdyElementSchema {
    const color = pick(random, DECOY_COLORS);
    const x = between(random, field.x, field.x + field.width);
    const y = between(random, field.y, field.y + field.height);
    const meta = tag(stage, `decoy:${kind}`);
    const roughness = random() < 0.6 ? 0 : between(random, 0.5, 2);
    switch (kind) {
        case "circle":
        case "diamond": {
            const size = between(random, 10, 46);
            const stretch = kind === "diamond" ? between(random, 0.7, 1.4) : 1;
            return {
                type: "shape",
                componentType: kind,
                drawdyElementId: id,
                x,
                y,
                width: size,
                height: size * stretch,
                strokeColor: pick(random, DECOY_COLORS),
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
            const length = between(random, 18, 70);
            const angle = between(random, 0, Math.PI * 2);
            const to: [number, number] = [x + Math.cos(angle) * length, y + Math.sin(angle) * length];
            const bendOffset = between(random, -0.5, 0.5) * length;
            const bend: [number, number] = [
                (x + to[0]) / 2 - Math.sin(angle) * bendOffset,
                (y + to[1]) / 2 + Math.cos(angle) * bendOffset,
            ];
            return {
                type: kind,
                drawdyElementId: id,
                from: [x, y],
                to,
                bend: [bend],
                color,
                strokeWidth: between(random, 2, 4),
                roughness,
                meta,
            };
        }
        case "squiggle": {
            const points: number[] = [];
            const turns = 4 + Math.floor(random() * 5);
            const amplitude = between(random, 4, 14);
            const span = between(random, 24, 70);
            const angle = between(random, 0, Math.PI * 2);
            for (let i = 0; i <= turns * 4; i++) {
                const along = (i / (turns * 4)) * span;
                const across = Math.sin((i / 4) * Math.PI) * amplitude;
                points.push(
                    x + Math.cos(angle) * along - Math.sin(angle) * across,
                    y + Math.sin(angle) * along + Math.cos(angle) * across
                );
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
        case "glyph":
        case "box-glyph":
            return {
                type: "text",
                drawdyElementId: id,
                x,
                y,
                text: kind === "glyph" ? pick(random, GLYPHS) : pick(random, BOX_GLYPHS),
                fontSize: Math.round(between(random, 16, 38)),
                color,
                meta,
            };
    }
}

export function generateDecoys(
    count: number,
    field: Rect,
    random: Random,
    stage: StageId,
    makeId: () => string
): Decoy[] {
    const result: Decoy[] = [];
    for (let i = 0; i < count; i++) {
        const kind = weightedPick(random, KIND_WEIGHTS);
        result.push({ kind, element: decoy(kind, makeId(), field, random, stage) });
    }
    return result;
}
