# Chess Royale — 4-Player Chess Simulator

A browser-based chess variant where four armies (Red, Blue, Yellow, Green)
share one connected, cross-shaped board.

> Also in this repo: [`dashboard/`](dashboard/) — an "AI OS" personal
> command center for connecting mail, calendar, and other tools. See
> [`dashboard/README.md`](dashboard/README.md).
>
> And: [`michelangelo/`](michelangelo/) — a redesigned, animated 3D website
> concept for Le Michelangelo (Italian restaurant, Québec). Serve the folder
> with any static server (e.g. `python3 -m http.server`) and open it.

## Play

Open `index.html` in a browser (no build step, no server required).

- **Play (You vs 3 AI)** — pick a color and play against three AI opponents.
- **Simulate (4 AI)** — sit back and watch all four AI armies battle it out.
  Use the speed slider and Pause/Resume to control playback.

## House rules

- The board is a 14×14 cross: a shared 8×8 center with a 3-row arm for each
  player's home territory.
- Turn order rotates Red → Blue → Yellow → Green.
- There is no "check" restriction — a king can be captured directly, which
  eliminates that player immediately (their remaining pieces are removed
  from the board). Last player standing wins.
- Pawns auto-promote to a Queen when they reach the far edge of the board.
- AI opponents use a 1-ply heuristic (capture value, elimination bonus, and
  a basic safety check against immediate recapture).

## Structure

- `index.html` / `style.css` — layout and UI.
- `js/board.js` — board geometry, piece setup.
- `js/rules.js` — move generation and move application.
- `js/ai.js` — AI move selection.
- `js/render.js` — canvas rendering.
- `js/main.js` — game state and event wiring.
