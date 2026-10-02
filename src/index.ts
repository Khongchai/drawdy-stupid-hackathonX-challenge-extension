import type { DriverModule } from "@drawdy/driver-protocol";
import { Game } from "./game";
import { bindHost, subscribe } from "./host";

let game: Game | null = null;

export const activate: DriverModule["activate"] = async ({ manifest, issueCommand, generateId, styling }) => {
    bindHost({ driverId: manifest.driverId, issue: issueCommand, generateId, styling });
    await subscribe({ type: "subscription:scene:elements-added", req: { properties: ["type", "componentType"] } });
    await subscribe({ type: "subscription:scene:elements-removed", req: { properties: [] } });
    await subscribe({ type: "subscription:scene:elements-replaced", req: { properties: [] } });
    await subscribe({ type: "subscription:scene:elements-updated", req: { properties: ["x", "y", "width", "height"] } });
    await subscribe({ type: "subscription:scene:click", req: {} });
    await subscribe({ type: "subscription:scene:drawdy-elements-dragged" });
    await subscribe({ type: "subscription:tool:laser" });
    game = new Game();
    game.boot();
};

export const onEvent: DriverModule["onEvent"] = async (event) => {
    game?.handle(event);
};
