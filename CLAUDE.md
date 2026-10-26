# Lumo: study game for ages 12–18 (code in `lumo/`)

Live site: https://lumo-study-qwd6.netlify.app (Netlify site id `33fee32a-d128-4135-ad8b-77fd8e08d443`).
Claude page: https://claude.ai/artifact/4k4wSSahgNoFufuCLYDrHM (republish `lumo/apps/web/dist-local/lumo.html` to that url).

## Rules
- Work on branch `claude/game-development-pdv2i2`; commit and push there. No pull requests unless asked.
- Netlify only builds commits whose message contains `[deploy]` (15 credits each, shared with the owner's other site Bakyos, which comes first). Put all changes in one `[deploy]` commit; other commits are free.
- This container can't reach the live site: check a deploy with the Netlify MCP (`get-project`, then `get-deploy`).
- Never ask the user to paste passwords, keys or tokens. The creator code exists only as a SHA-256 hash (`netlify/lib/gifts.ts`); never commit the code itself.
- No model names in commits or code.
- The user (Louis, the creator): reply in simple English (French only for Facebook posts), straight to the point, double-check the work, and end each reply with a one-line "Council check:".

## Layout (`lumo/`)
- `packages/core`: learning and game rules (`quiz/`, `game/`, `live/`, `xp.ts`, `srs.ts`, `mastery.ts`), vitest tests.
- `apps/web`: React 19, Vite, Tailwind 4. The website and the Claude page both run the in-browser backend `src/local/backend.ts` (state kept in the browser, synced per account). Claude calls: `src/local/reader.ts` (decks from photos, topic or notes), `src/local/writer.ts` (question bank), `src/local/liveLocal.ts` (Live host engine).
- `netlify/`: function `auth`; edge functions `data` (data, rooms, gifts) and `claude` (AI proxy); `lib/` and `tests/`.
- `apps/server`: older Fastify/Postgres version (still tested, not deployed). `e2e/`: Playwright specs.

## Question system
- A deck = topics → sub-aspects (`Concept`) → facts (`keyPoints`, one testable fact each). `reader.ts` asks Claude for one JSON line per sub-aspect; `mergeIdeas` drops repeated facts.
- `writer.ts` writes 2 questions per fact from different angles, each tagged `"f"` (→ `Question.facts`), then fills any fact left without one. `topUpIfLow` writes a new angle when every question of a fact was met.
- Play = the whole deck, one question per fact (`planFullRound` in `core/quiz/round.ts`, max 150), topic by topic; a miss comes back only with another question; never the same question twice in a round. Quick round = `planQuickRound`. A round waits (`writingNow`) for questions Claude is still writing.
- Live (`liveLocal.ts` `makeQuestions`): one-tap questions, never repeated, spread over facts; more join mid-game; no 3-2-1.
- Account copy (Claude page store: 256 KB per document): `deck-<id>`, `bank-<id>-<k>` (question parts), `prog-<id>` (progress, seen, fact log), `main`.
- Real-output check: run the prompts from `readingPrompt`/`writingPrompt` through the small model and parse with `readDeckLines`/`questionFromDraft`.

## Commands (run in `lumo/`)
- Unit tests: `service postgresql start; npm test` and `npm run test:netlify`. Typecheck: `cd apps/web && npx tsc --noEmit -p .`
- Builds: `npm run build:netlify -w @lumo/web` (website), `npm run build:local -w @lumo/web` (Claude page).
- E2E servers: `npx tsx e2e/fixtures/netlify-serve.ts "$PWD/apps/web/dist-netlify"` (port 8899); `python3 e2e/fixtures/make-pages.py /tmp/localtest && (cd /tmp/localtest && python3 -m http.server 8765)`; `npm run dev` (port 5173, server version).
- E2E: `CHROMIUM_PATH=/opt/pw-browsers/chromium NETLIFY_URL=http://127.0.0.1:8899/ LOCAL_URL=http://localhost:8765/index.html MULTI_URL=http://localhost:8765/multi.html npx playwright test e2e/<spec>.ts`
- 3D is off in test browsers (add `?3d=1` to see it). The sandbox escape-room test is known to be flaky.
- Foreground `sleep` is blocked: wait with a loop on `$SECONDS`. Don't use `pkill -f` (it kills the shell).
