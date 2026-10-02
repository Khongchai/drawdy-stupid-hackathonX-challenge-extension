import type { DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { Rect } from "./geometry";
import {
    addElements,
    animateOutAndRemove,
    consumeDriverRemoval,
    existingIds,
    findEmptyRegion,
    flyTo,
    removeTaggedElements,
    roleOf,
    toast,
} from "./scene";
import { StageId, roundButton, textBlock } from "./scene-kit";
import { Completion, Stage, StageEnv } from "./stage";
import { createStage } from "./stages";
import { PANEL_INK } from "./theme";

const ORDER: readonly StageId[] = ["intro", "buttons", "find-rect", "diny", "maze", "finale"];
const REGION_SIZE = { width: 1600, height: 1000 };
const FADE_OUT_MS = 800;

type Completed = { ids: string[]; goIds: Set<string> };

export class Game {
    private stage: Stage | null = null;
    private region: Rect | null = null;
    private completed: Completed | null = null;
    private transitioning = false;
    private generation = 0;
    private queue: Promise<void> = Promise.resolve();

    private run(task: () => Promise<void>): void {
        this.queue = this.queue.then(task).catch((error) => {
            console.error("[stupid-hackathon-x]", error);
            this.transitioning = false;
        });
    }

    boot(): void {
        this.run(async () => {
            this.transitioning = true;
            const found = await removeTaggedElements();
            const resumeAt = ORDER.filter((id) => found.has(id)).pop() ?? "intro";
            await this.enter(resumeAt, null);
            this.transitioning = false;
        });
    }

    handle(event: DriverSubscriptionEvent): void {
        switch (event.type) {
            case "subscription:scene:click":
                if (this.completed && event.body.drawdyElementIds.some((id) => this.completed!.goIds.has(id))) {
                    this.advance();
                    return;
                }
                break;
            case "subscription:scene:elements-removed":
                this.checkRemoved(event.body.drawdyElements.map((e) => e.id));
                break;
            case "subscription:scene:elements-replaced":
                this.checkReplaced(
                    event.body.replaced.map((e) => e.id),
                    new Set(event.body.drawdyElements.map((e) => e.id))
                );
                break;
        }
        if (!this.transitioning && this.stage) this.stage.handle(event);
    }

    private requiredIds(): Set<string> {
        const ids = new Set<string>(this.stage ? [...this.stage.requiredIds()] : []);
        for (const id of this.completed?.ids ?? []) ids.add(id);
        return ids;
    }

    private checkRemoved(removed: readonly string[]): void {
        const external = removed.filter((id) => !consumeDriverRemoval(id));
        if (this.transitioning || external.length === 0) return;
        const required = this.requiredIds();
        const missing = external.find((id) => required.has(id));
        if (missing) this.fail(missing);
    }

    private checkReplaced(replaced: readonly string[], replacements: Set<string>): void {
        if (this.transitioning) return;
        const required = this.requiredIds();
        const suspects = replaced.filter((id) => required.has(id) && !replacements.has(id));
        if (suspects.length === 0) return;
        const generation = this.generation;
        void existingIds(suspects).then((present) => {
            if (generation !== this.generation) return;
            const missing = suspects.find((id) => !present.has(id));
            if (missing) this.fail(missing);
        });
    }

    private envFor(region: Rect, error: string | null, generation: number): StageEnv {
        return {
            region,
            error,
            isCurrent: () => generation === this.generation && !this.transitioning,
            complete: (result) => {
                if (generation === this.generation) this.run(() => this.showCompletion(generation, result));
            },
            advance: () => {
                if (generation === this.generation) this.advance();
            },
            restart: () => {
                if (generation === this.generation) this.run(() => this.replaceStage("intro", null));
            },
            toast: (text, tone, durationMs) => void toast(text, tone, durationMs),
        };
    }

    private async enter(id: StageId, error: string | null): Promise<void> {
        const region = await findEmptyRegion(REGION_SIZE);
        this.generation++;
        this.region = region;
        this.completed = null;
        const stage = createStage(id, this.envFor(region, error, this.generation));
        this.stage = stage;
        await flyTo(region);
        await stage.build();
    }

    private async showCompletion(generation: number, result: Completion): Promise<void> {
        if (generation !== this.generation || this.completed || !this.region) return;
        const region = this.region;
        const goAt = result.goAt ?? { x: region.x + region.width - 150, y: region.y + region.height - 130 };
        const textAt = result.textAt ?? { x: region.x + 80, y: region.y + region.height - 190 };
        const lines = textBlock({
            stage: this.stage?.id ?? "intro",
            role: "success-text",
            x: textAt.x,
            y: textAt.y,
            lines: result.lines,
            fontSize: 34,
            ...(result.onPanel ? { color: PANEL_INK.success } : { ink: "success" as const }),
        });
        const go = roundButton({
            stage: this.stage?.id ?? "intro",
            role: "go-button",
            center: goAt,
            radius: 78,
            label: result.goLabel ?? "Go",
        });
        this.completed = {
            ids: [...lines.map((e) => e.drawdyElementId), ...go.ids],
            goIds: new Set(go.ids),
        };
        await addElements([...lines, ...go.elements]);
    }

    private advance(): void {
        this.run(async () => {
            if (this.transitioning || !this.stage) return;
            const index = ORDER.indexOf(this.stage.id);
            await this.replaceStage(ORDER[index + 1] ?? "intro", null);
        });
    }

    private fail(missingId: string): void {
        const role = roleOf(missingId) ?? "a challenge element";
        this.run(async () => {
            if (this.transitioning) return;
            const reason = `Something the challenge needs was deleted (${role}). Back to the start.`;
            void toast(reason, "bad", 5000);
            await this.replaceStage("intro", reason);
        });
    }

    private async replaceStage(next: StageId, error: string | null): Promise<void> {
        this.transitioning = true;
        const old = this.stage;
        const oldIds = [...(old ? old.ownedIds() : []), ...(this.completed?.ids ?? [])];
        this.stage = null;
        this.completed = null;
        this.generation++;
        if (old) await old.dispose();
        const leaving = animateOutAndRemove(oldIds, FADE_OUT_MS);
        await this.enter(next, error);
        this.transitioning = false;
        await leaving;
    }
}
