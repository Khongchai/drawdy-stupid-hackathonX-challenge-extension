# Stupid Hackathon X Challenge

A Drawdy extension with four challenges for Stupid Hackathon X (10-11 October 2026, Cleverse Office, 13th floor). It uses the [Drawdy Driver Protocol](https://github.com/drawdyio/drawdy-driver-protocol).

When the extension loads, it finds an empty part of the board, moves the camera there and shows the intro. Click **Yes** to start. After each solved challenge a green **Go** button appears. Clicking it moves the camera to a new empty area, fades the old challenge out and removes it.

If something a challenge needs is deleted (by you, by undo, or by a collaborator), the extension goes back to the intro and shows what went missing.

## The challenges (spoilers)

| # | Challenge | Solution |
| --- | --- | --- |
| 1 | Click two buttons at the same time. | Drag one button on top of the other. At least 30 % of the smaller button has to overlap. |
| 2 | Find the rectangle in 8,000 shapes and click on it. | There is no rectangle. Draw one with the rectangle tool. |
| 3 | Click on Diny. She runs away from the cursor. | Tap her on a touch screen, or switch devtools to touch emulation. A touch never moves the cursor before the tap, so she does not see it coming. After 30 seconds you pass anyway with "อกไก่ยังมีคนหมัก แต่อกหักต้องปล่อยเขาไปนะพี่นะ". |
| 4 | อย่าชนขอบ: get out of a slowly moving maze. | Pick the laser pointer, press the green Start circle and drag out of the exit without touching a wall. |

## Develop

```bash
pnpm install
pnpm dev          # dev server on http://localhost:5173
```

In Drawdy, open a local board, press `⌘K` and run **Add extension dev server** with `http://localhost:5173`. Drawdy reloads the extension on every save. On each load the extension removes its own elements and rebuilds the stage it was on.

```bash
pnpm test         # maze generator, laser judge, decoy and flee logic
pnpm typecheck
pnpm build        # dist/stupidhack-x-challenge.drawdyx
```

## Changing Diny

Diny is embedded in the bundle as base64 so the extension does not depend on a hosted URL. To use another image:

```bash
cp path/to/diny.png assets/diny.png
pnpm embed-diny   # regenerates src/assets/diny.ts
```

## How it works

- `src/game.ts` runs the stage order (intro, buttons, find-rect, diny, maze, finale), the Go transition, and the reset to the intro when a required element is removed.
- Every element the extension adds carries `meta.stupidHackathonX = { stage, role }`. On load, the extension reads these tags to find the stage to resume and removes the old elements.
- Diny, the maze walls and the maze markers move with `command:scene:begin-preview` and `command:scene:preview-transforms`. The movement is local to the person running the extension. Collaborators see these elements at their starting positions.
- Challenge 4 starts a run when `subscription:scene:pointer` reports a press on the Start circle and the active tool is `laser-pointer`. Each `subscription:scene:pointer-position` sample after that is checked against the wall positions at that moment. `subscription:tool:laser` fires on release and ends the run.
- Challenge 2 adds at most `10,000 - (elements already on the board) - 60` shapes, because boards are capped at 10,000 elements.

Permissions: `scene` (everything on the canvas) and `dom` (toasts).
