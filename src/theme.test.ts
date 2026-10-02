import { describe, expect, it } from "vitest";
import { BUTTON, CANVAS_BACKGROUNDS, INK, PANEL_INK, Theme, XP, contrastRatio } from "./theme";

const readableTextContrast = 4.5;
const themes: Theme[] = ["light", "dark"];

describe("INK", () => {
    it.each(themes)("gives every %s text color at least 4.5:1 contrast on every canvas background of that theme", (theme) => {
        for (const background of CANVAS_BACKGROUNDS[theme]) {
            for (const [token, color] of Object.entries(INK[theme])) {
                expect({ token, background, ratio: contrastRatio(color, background) >= readableTextContrast }).toEqual({
                    token,
                    background,
                    ratio: true,
                });
            }
        }
    });

    it("gives every panel text color at least 4.5:1 contrast on the XP dialog body", () => {
        for (const [token, color] of Object.entries(PANEL_INK)) {
            expect({ token, ratio: contrastRatio(color, XP.dialogBody) >= readableTextContrast }).toEqual({ token, ratio: true });
        }
    });
});

describe("BUTTON", () => {
    it("gives white button labels at least 4.5:1 contrast on every colored button face", () => {
        for (const [name, face] of Object.entries({ go: BUTTON.go.face, blue: BUTTON.blue.face, orange: BUTTON.orange.face, close: BUTTON.close })) {
            expect({ name, ratio: contrastRatio(XP.white, face) >= readableTextContrast }).toEqual({ name, ratio: true });
        }
    });

    it("gives dark ink at least 4.5:1 contrast on the grey button face", () => {
        expect(contrastRatio(XP.ink, BUTTON.grey.face)).toBeGreaterThanOrEqual(readableTextContrast);
    });
});
