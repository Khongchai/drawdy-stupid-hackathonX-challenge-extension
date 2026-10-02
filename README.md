# Stupid Hackathon X Challenge

A Drawdy extension with five challenges for Stupid Hackathon X (10-11 October 2026, Cleverse Office, 13th floor). It uses the [Drawdy Driver Protocol](https://github.com/drawdyio/drawdy-driver-protocol).

When the extension loads, it finds an empty part of the board, moves the camera there and shows the intro. Click **Yes** to start. After each solved challenge a green **Go** button appears. Clicking it moves the camera to a new empty area, fades the old challenge out and removes it.

If something a challenge needs is deleted (by you, by undo, or by a collaborator), the extension goes back to the intro and shows what went missing.

## The challenges (spoilers)

| # | Challenge | Solution |
| --- | --- | --- |
| 1 | Sign up for Drawdy. | Sign in with Drawdy's own sign-in button. The page reloads after sign-in and the challenge passes. If you were already signed in, it passes right away. |
| 2 | Click two buttons at the same time. | Drag one button on top of the other, then click where they overlap. Dropping a button does not count as a click. |
| 3 | Find the rectangle in 9,900 shapes and click on it. | There is no rectangle. Draw one with the rectangle tool, then click it. |
| 4 | Click Diny. She runs away from the cursor and opens her mouth while she runs. | Tap her on a touch screen, or switch devtools to touch emulation. A touch never moves the cursor before the tap, so she does not see it coming. After 30 seconds you pass anyway with "อกไก่ยังมีคนหมัก แต่อกหักต้องปล่อยเขาไปนะพี่นะ". |
| 5 | อย่าชนขอบ: get out of a slowly moving 7 by 7 maze. | Pick the laser pointer (the challenge says so), press the green Start circle and drag out of the exit without touching a wall. Past the exit is a winding corridor that turns up, down and right. Every time you reach its end, two more cells open and a "hehehe 😆" toast appears, for 20 seconds; then the end stays open and you can get out. |

## Getting it wrong

Every wrong move (No on the intro, one button, a shape that isn't a rectangle, chasing Diny, touching a wall, the wrong tool, letting go early, deleting challenge elements) raises an annoyance level. The level drops by one every 30 seconds without a wrong move and goes back to zero at the start of every step. Deletions keep their own line count across steps, since each one sends you back to the intro. As it rises, the replies get worse:

| Level | What happens |
| --- | --- |
| 0-2 | A plain reply, then a snarkier one. Each kind of mistake has its own lines, then falls back to general meltdown lines. |
| 3+ | The toast turns red, gets a shouting title and shakes. |
| 4+ | A red vignette flashes over the window (one DOM overlay) and the camera shakes, harder each level. |
| 5+ | A shockwave: one ring and one big "NO" / "ไม่" grow out of the click and fade. Two preview elements, so nothing is added to the board or the undo history. |
| 6+ | The camera punches in and eases back after the shake. |
| 7+ | Every third level, a fake "Deleting your board... 99%" progress toast. Nothing is deleted. |
| 8+ | The text gets mangled with combining characters. |

The lines are in `src/tantrum-script.ts` and the effects in `src/tantrum.ts`.

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
- Challenge 5 starts a run when `subscription:scene:pointer` reports a press on the Start circle and the active tool is `laser-pointer`. Each `subscription:scene:pointer-position` sample after that is checked against the wall positions at that moment. `subscription:tool:laser` fires on release and ends the run.
- Text on the canvas uses a light or dark palette picked from `ModuleStyling.theme` and is recolored on `subscription:dom:theme-changed`. Text inside the XP windows uses the light palette, since the windows are light in both themes. `src/theme.test.ts` checks every text color for 4.5:1 contrast.
- When the rectangle is found, the shapes stay where they are and the camera glides to the rectangle over 1.6 seconds. Pressing Go removes all of them in one go once the camera has left, without animating them.
- Challenge 1 reads your own entry from `command:collaboration:get-all-users-in-board` and rechecks on `subscription:collaboration:presence-changed`. The protocol has no signed-in flag, so you count as signed up if you have an avatar, or if your name is not one of Drawdy's random guest names ("Adjective Animal", copied from `frontend/src/features/collaboration/constants.ts` into `src/sign-up.ts`). Renaming yourself also passes. If the `collaboration` permission is denied, you pass anyway.
- The finale shows your avatar (or your color and initial), your name, and whether you are signed in.
- Challenge 3 puts one shape in each 72 px grid cell, with at least 28 px between neighbours, so no tile of the canvas gets crowded. The field is about 9,100 by 5,700 px for 9,900 shapes. Once the rectangle is found, the camera moves to it and the Go button appears there.
- Challenge 3 adds at most `10,000 - (elements already on the board) - 60` shapes, because boards are capped at 10,000 elements.

Permissions: `scene` (everything on the canvas), `dom` (toasts) and `collaboration` (your name and avatar).
