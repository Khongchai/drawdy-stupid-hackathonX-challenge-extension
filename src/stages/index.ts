import { StageId } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { ButtonsStage } from "./buttons";
import { DinyStage } from "./diny";
import { FinaleStage } from "./finale";
import { FIND_RECT_REGION, FindRectStage } from "./find-rect";
import { IntroStage } from "./intro";
import { MazeStage } from "./maze";

const DEFAULT_REGION = { width: 1600, height: 1000 };

export function regionSizeFor(id: StageId): { width: number; height: number } {
    return id === "find-rect" ? FIND_RECT_REGION : DEFAULT_REGION;
}

export function createStage(id: StageId, env: StageEnv): Stage {
    switch (id) {
        case "intro":
            return new IntroStage(env);
        case "buttons":
            return new ButtonsStage(env);
        case "find-rect":
            return new FindRectStage(env);
        case "diny":
            return new DinyStage(env);
        case "maze":
            return new MazeStage(env);
        case "finale":
            return new FinaleStage(env);
    }
}
