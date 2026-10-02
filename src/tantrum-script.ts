import { Random } from "./random";

export type TantrumKind =
    | "no-button"
    | "one-button"
    | "not-rect"
    | "diny-miss"
    | "wall"
    | "wrong-tool"
    | "let-go"
    | "missed-start"
    | "deleted";

export type TantrumEffect = "shake-toast" | "shake-camera" | "no-burst" | "fake-delete" | "mangle";

export type Reaction = {
    text: string;
    unhinged: boolean;
    effects: TantrumEffect[];
    intensity: number;
};

export const LINES: Record<TantrumKind, readonly string[]> = {
    "no-button": [
        "Wrong answer.",
        "Still wrong.",
        "Click Yes.",
        "The green one. The one that says Yes.",
        "No is not an option. It is on the screen, but it is not an option.",
        "I will keep putting this button here and you will keep being wrong.",
    ],
    "one-button": [
        "Only one button.",
        "Still one button.",
        "One. Button. Again.",
        "ONE BUTTON. THE TITLE SAYS BOTH.",
        "I am an extension. I have no hands. Even I know it's two buttons.",
        "Do you want me to draw you a diagram? I have the scene permission. I can do it.",
        "I'm telling Diny.",
    ],
    "not-rect": [
        "Not a rectangle.",
        "Also not a rectangle.",
        "That one is round. Rectangles are not round.",
        "You have clicked many things. None of them had four corners.",
        "I put 8,000 of these here and you are going to click every single one, aren't you.",
        "Counting corners for you: zero. Zero corners.",
        "สี่เหลี่ยม. สี่. เหลี่ยม.",
    ],
    "diny-miss": [
        "Diny says no.",
        "Diny says no again.",
        "She is faster than you.",
        "Diny has filed a restraining order against your cursor.",
        "Diny is a dinosaur. She has survived worse than you.",
        "She can hear your mouse.",
    ],
    wall: [
        "You touched a wall.",
        "Wall again.",
        "The walls are the black lines. Don't touch the black lines.",
        "THE WALL. YOU TOUCHED THE WALL.",
        "อย่าชนขอบ. It is literally the name of the challenge.",
        "The walls have feelings and you keep hurting them.",
        "I am going to start charging you per wall.",
    ],
    "wrong-tool": [
        "Use the laser pointer.",
        "Laser pointer.",
        "LASER. POINTER.",
        "The red dot one. Pew pew.",
        "I said laser. You heard 'anything but laser'.",
    ],
    "let-go": [
        "You let go too early.",
        "Hold the button until you're out.",
        "Don't let go. Like in Titanic, but the opposite.",
        "Your finger has one job.",
        "Keep. Holding. The. Button.",
    ],
    "missed-start": [
        "Start on the green circle.",
        "The green circle. In the middle.",
        "GREEN. CIRCLE. MIDDLE.",
        "It is the only green circle. You missed the only green circle.",
    ],
    deleted: [
        "Something the challenge needs was deleted. Back to the start.",
        "You deleted it again. Back to the start.",
        "Stop deleting my stuff.",
        "I MADE THAT. WITH MY OWN COMMANDS.",
        "Every time you delete something, Diny cries a little.",
        "Fine. Delete everything. See if I care. (I care.)",
    ],
};

export const MELTDOWN_LINES: readonly string[] = [
    "I have been very patient.",
    "ขอร้องล่ะ",
    "This is why this hackathon has no business value.",
    "I'm going to go lie down in the worker thread.",
    "Have you tried being better?",
    "I don't even have a deactivate hook. I can't leave. Help.",
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "I'm not mad. I'm just disappointed. Also mad.",
];

const COMBINING_MARKS = ["\u0300", "\u0301", "\u0302", "\u0303", "\u0308", "\u030a", "\u0316", "\u0317", "\u031c", "\u0324", "\u0330", "\u0334", "\u0336", "\u034f", "\u0353", "\u035c"];

export function mangle(text: string, amount: number, random: Random): string {
    let out = "";
    for (const char of text) {
        out += char;
        if (char === " ") continue;
        const marks = Math.floor(random() * (amount + 1));
        for (let i = 0; i < marks; i++) out += COMBINING_MARKS[Math.floor(random() * COMBINING_MARKS.length)];
    }
    return out;
}

export const LEVELS = {
    unhinged: 3,
    shakeCamera: 4,
    noBurst: 5,
    fakeDelete: 7,
    mangle: 8,
};

export function reactionFor(kind: TantrumKind, timesForKind: number, level: number, random: Random): Reaction {
    const lines = LINES[kind];
    const pastScript = timesForKind >= lines.length;
    const base = pastScript ? MELTDOWN_LINES[Math.floor(random() * MELTDOWN_LINES.length)] : lines[timesForKind];
    const effects: TantrumEffect[] = [];
    if (level >= LEVELS.unhinged) effects.push("shake-toast");
    if (level >= LEVELS.shakeCamera) effects.push("shake-camera");
    if (level >= LEVELS.noBurst) effects.push("no-burst");
    if (level >= LEVELS.fakeDelete && level % 3 === 1) effects.push("fake-delete");
    if (level >= LEVELS.mangle) effects.push("mangle");
    const intensity = Math.max(0, level - LEVELS.unhinged + 1);
    const text = effects.includes("mangle") ? mangle(base, Math.min(4, level - LEVELS.mangle + 1), random) : base;
    return { text, unhinged: level >= LEVELS.unhinged, effects, intensity };
}

export class AnnoyanceMeter {
    private level = 0;
    private lastAt = 0;
    private perKind = new Map<TantrumKind, number>();

    constructor(private readonly decayEveryMs: number) {}

    record(kind: TantrumKind, now: number): { level: number; timesForKind: number } {
        if (this.lastAt > 0) {
            const calmSteps = Math.floor((now - this.lastAt) / this.decayEveryMs);
            this.level = Math.max(0, this.level - calmSteps);
        }
        this.lastAt = now;
        const timesForKind = this.perKind.get(kind) ?? 0;
        this.perKind.set(kind, timesForKind + 1);
        const level = this.level;
        this.level++;
        return { level, timesForKind };
    }

    reset(keepCountsFor: readonly TantrumKind[]): void {
        this.level = 0;
        this.lastAt = 0;
        for (const kind of [...this.perKind.keys()]) {
            if (!keepCountsFor.includes(kind)) this.perKind.delete(kind);
        }
    }
}
