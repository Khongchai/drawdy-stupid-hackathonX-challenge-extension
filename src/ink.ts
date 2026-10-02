import { INK, InkToken, Theme } from "./theme";

let theme: Theme = "light";

export type ThemedProperty = "strokeColor" | "fillColor";

const themedById = new Map<string, { token: InkToken; property: ThemedProperty }>();

export function currentTheme(): Theme {
    return theme;
}

export function setTheme(next: Theme): boolean {
    const changed = next !== theme;
    theme = next;
    return changed;
}

export function ink(token: InkToken): string {
    return INK[theme][token];
}

export function trackInk(id: string, token: InkToken, property: ThemedProperty = "strokeColor"): void {
    themedById.set(id, { token, property });
}

export function forgetInk(id: string): void {
    themedById.delete(id);
}

export function inkUpdates(): { drawdyElementId: string; properties: Partial<Record<ThemedProperty, string>> }[] {
    return [...themedById].map(([drawdyElementId, { token, property }]) => ({
        drawdyElementId,
        properties: { [property]: ink(token) },
    }));
}
