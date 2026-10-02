import { StageId } from "../scene-kit";
import { Stage, StageEnv } from "../stage";
import { ButtonsStage } from "./buttons";
import { DinyStage } from "./diny";
import { FinaleStage } from "./finale";
import { FindRectStage } from "./find-rect";
import { IntroStage } from "./intro";
import { MazeStage } from "./maze";

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
