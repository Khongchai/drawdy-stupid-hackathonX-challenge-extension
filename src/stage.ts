import type { DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { Point, Rect } from "./geometry";
import { StageId } from "./scene-kit";
import { ToastTone } from "./scene";

export type Completion = {
    lines: readonly string[];
    goLabel?: string;
    textAt?: Point;
    goAt?: Point;
    onPanel?: boolean;
};

export type StageEnv = {
    region: Rect;
    error: string | null;
    isCurrent(): boolean;
    complete(result: Completion): void;
    advance(): void;
    restart(): void;
    toast(text: string, tone?: ToastTone, durationMs?: number): void;
};

export interface Stage {
    readonly id: StageId;
    build(): Promise<void>;
    requiredIds(): Iterable<string>;
    ownedIds(): Iterable<string>;
    handle(event: DriverSubscriptionEvent): void;
    dispose(): Promise<void>;
}
