import type { DriverModule } from "@drawdy/driver-protocol";
import { Game } from "./game";
import { bindHost, subscribe } from "./host";
import { setTheme } from "./ink";
import { applyTheme } from "./scene";

let game: Game | null = null;

export const activate: DriverModule["activate"] = async ({ manifest, issueCommand, generateId, styling }) => {
    bindHost({ driverId: manifest.driverId, issue: issueCommand, generateId, styling });
    setTheme(styling.theme);
    await subscribe({ type: "subscription:scene:elements-added", req: { properties: ["type", "componentType"] } });
    await subscribe({ type: "subscription:scene:elements-removed", req: { properties: [] } });
    await subscribe({ type: "subscription:scene:elements-replaced", req: { properties: [] } });
    await subscribe({ type: "subscription:scene:click", req: {} });
    await subscribe({ type: "subscription:tool:laser" });
    await subscribe({ type: "subscription:dom:theme-changed" });
    game = new Game();
    game.boot();
};

export const onEvent: DriverModule["onEvent"] = async (event) => {
    if (event.type === "subscription:dom:theme-changed") {
        void applyTheme(event.body.styling.theme);
        return;
    }
    game?.handle(event);
};
