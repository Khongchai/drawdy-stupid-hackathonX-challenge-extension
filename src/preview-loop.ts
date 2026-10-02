import type { PreviewTransform } from "@drawdy/driver-protocol";
import { trySend } from "./host";

export type PreviewFrame = { drawdyElementId: string; transform: PreviewTransform }[];

export function startPreviewLoop(frame: (nowMs: number) => PreviewFrame, retryMs = 100): () => void {
    let running = true;
    const tick = async () => {
        if (!running) return;
        const previews = frame(performance.now());
        const sent =
            previews.length > 0 &&
            (await trySend({ type: "command:scene:preview-transforms", req: { previews } })) !== null;
        if (running) setTimeout(tick, sent ? 0 : retryMs);
    };
    void tick();
    return () => {
        running = false;
    };
}

export async function beginPreview(ids: readonly string[]): Promise<Set<string>> {
    const value = await trySend({
        type: "command:scene:begin-preview",
        req: { drawdyElementIds: [...ids] },
    });
    return new Set(value?.began ?? []);
}

export async function endPreview(): Promise<void> {
    await trySend({ type: "command:scene:end-preview", req: {} });
}
