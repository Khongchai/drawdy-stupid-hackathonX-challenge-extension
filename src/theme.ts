export const XP = {
    sky: "#1cb9e6",
    paleSky: "#d5ecf2",
    cloud: "#f7f7f5",
    blissGreen: "#7ecc16",
    deepGrass: "#2c7000",
    taskbarBlue: "#235ddb",
    startGreen: "#3aa73c",
    titleNavy: "#1d298b",
    goldfish: "#fd8209",
    msnAqua: "#22aae4",
    clover: "#79ab28",
    winGrey: "#e1ded5",
    dialogBody: "#ece9d8",
    tooltip: "#ffffe1",
    closeRed: "#d9442e",
    ink: "#1b1b1b",
    white: "#ffffff",
} as const;

export type Theme = "light" | "dark";

export type InkToken = "title" | "body" | "accent" | "success" | "danger" | "warm" | "wall";

export type Ink = Record<InkToken, string>;

export const INK: Record<Theme, Ink> = {
    light: {
        title: "#1d298b",
        body: "#1b1b1b",
        accent: "#1a4bb8",
        success: "#2c7000",
        danger: "#b3261e",
        warm: "#a8470a",
        wall: "#1d298b",
    },
    dark: {
        title: "#a9c8ff",
        body: "#f2f2f2",
        accent: "#7cc4ff",
        success: "#9be36b",
        danger: "#ff8a7a",
        warm: "#ffb35c",
        wall: "#a9c8ff",
    },
};

export const PANEL_INK: Ink = INK.light;

export const BUTTON = {
    go: { face: "#2b7a2e", edge: "#1d5420" },
    blue: { face: "#235ddb", edge: "#1d298b" },
    orange: { face: "#b04f00", edge: "#7a3700" },
    grey: { face: XP.winGrey, edge: "#8f8b80" },
    close: "#b3261e",
} as const;

export const CANVAS_BACKGROUNDS: Record<Theme, readonly string[]> = {
    light: ["#ffffff", "#f7f7f5"],
    dark: ["#121214", "#18181b", "#1f1f23", "#27272a"],
};

export const DECOY_COLORS: Record<Theme, readonly string[]> = {
    light: [XP.sky, XP.msnAqua, XP.blissGreen, XP.clover, XP.taskbarBlue, XP.titleNavy, XP.goldfish, XP.startGreen],
    dark: [XP.sky, XP.msnAqua, XP.blissGreen, XP.clover, XP.taskbarBlue, XP.goldfish, XP.startGreen, XP.paleSky],
};

export const YARD: Record<Theme, { fill: string; stroke: string }> = {
    light: { fill: XP.paleSky, stroke: XP.clover },
    dark: { fill: "#163247", stroke: XP.blissGreen },
};

function channel(hex: string, offset: number): number {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
    return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

export function contrastRatio(a: string, b: string): number {
    const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
}
