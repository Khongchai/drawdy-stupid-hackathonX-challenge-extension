# Stupid Hackathon X Challenge

A Drawdy extension with four challenges for Stupid Hackathon X (10-11 October 2026, Cleverse Office, 13th floor). It uses the [Drawdy Driver Protocol](https://github.com/drawdyio/drawdy-driver-protocol).

When the extension loads, it finds an empty part of the board, moves the camera there and shows the intro. Click **Yes** to start. After each solved challenge a green **Go** button appears. Clicking it moves the camera to a new empty area, fades the old challenge out and removes it.

If something a challenge needs is deleted (by you, by undo, or by a collaborator), the extension goes back to the intro and shows what went missing.

## The challenges (spoilers)

| # | Challenge | Solution |
| --- | --- | --- |
| 1 | Click two buttons at the same time. | Drag one button on top of the other, then click where they overlap. Dropping a button does not count as a click. |
| 2 | Find the rectangle in 8,000 shapes and click on it. | There is no rectangle. Draw one with the rectangle tool. |
| 3 | Click Diny. She runs away from the cursor and opens her mouth while she runs. | Tap her on a touch screen, or switch devtools to touch emulation. A touch never moves the cursor before the tap, so she does not see it coming. After 30 seconds you pass anyway with "อกไก่ยังมีคนหมัก แต่อกหักต้องปล่อยเขาไปนะพี่นะ". |
| 4 | อย่าชนขอบ: get out of a slowly moving 7 by 7 maze. | Pick the laser pointer, press the green Start circle and drag out of the exit without touching a wall. Other tools get "Wrong tool." |

## Develop

```bash
pnpm install
pnpm dev          # dev server on http://localhost:5173
```

In Drawdy, open a local board, press `⌘K` and run **Add extension dev server** with `http://localhost:5173`. Drawdy reloads the extension on every save. On each load the extension removes its own elements and rebuilds the stage it was on.

```bash
pnpm test         # maze, laser judge, shapes, fall animation, Diny escape, color contrast
pnpm typecheck
pnpm build        # dist/stupidhack-x-challenge.drawdyx
```

## Diny

Diny is two images on the Drawdy CDN, `https://cdn.drawdy.io/stupid-hackathonx/diny-mouth-close.png` and `diny-mouth-open.png`. Both are on the board; the one not shown is moved off the canvas with a preview transform, so swapping is local and nothing syncs.

## How it works

- `src/game.ts` runs the stage order (intro, buttons, find-rect, diny, maze, finale), the Go transition, and the reset to the intro when a required element is removed.
- Every element the extension adds carries `meta.stupidHackathonX = { stage, role }`. On load, the extension reads these tags to find the stage to resume and removes the old elements.
- Diny, the maze walls and the maze markers move with `command:scene:begin-preview` and `command:scene:preview-transforms`. The movement is local to the person running the extension. Collaborators see these elements at their starting positions.
- Challenge 4 starts a run when `subscription:scene:pointer` reports a press on the Start circle and the active tool is `laser-pointer`. Each `subscription:scene:pointer-position` sample after that is checked against the wall positions at that moment. `subscription:tool:laser` fires on release and ends the run.
- Text on the canvas uses a light or dark palette picked from `ModuleStyling.theme` and is recolored on `subscription:dom:theme-changed`. Text inside the XP windows uses the light palette, since the windows are light in both themes. `src/theme.test.ts` checks every text color for 4.5:1 contrast.
- When the rectangle is found, the 8,000 shapes fall with a keyframed `LocalAnimation` (a small lift, then an accelerating drop with spin and fade, staggered per shape) and are removed when it ends.
- Challenge 2 adds at most `10,000 - (elements already on the board) - 60` shapes, because boards are capped at 10,000 elements.

Permissions: `scene` (everything on the canvas) and `dom` (toasts).
