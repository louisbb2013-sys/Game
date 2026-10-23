# Lumo ✨ — study smarter, understand deeper

Lumo turns your notes into quizzes that help you **truly understand**, not memorize by heart.

**Play Lumo Study:** https://lumo-study-qwd6.netlify.app
Mascot: **Lumo the firefly**, whose light grows as you master ideas.

See [PLAN.md](PLAN.md) for architecture, data model and milestones.

## Status
- ✅ **Milestone 1 — Foundation**: monorepo, core game/learning rules (spaced repetition, mastery, XP & levels,
  streaks, hearts, leagues, safe usernames), Fastify API with Google / email-code / dev sign-in, PWA shell
  (EN/FR, dark mode, dyslexia font, larger text, reduced motion, delete-my-data).
- ✅ **Milestone 2 — Decks & quiz engine**: 16 question types generated fresh each time from *concepts*
  (never a fixed bank), server-side grading (typo/synonym tolerant, partial credit, AI grading for open answers
  with an offline fallback), anti-repeat planner (never the same format twice in a row per concept, Bloom
  depth that rises with success, retries asked differently), spaced repetition, mastery map, practice /
  review / fix-mistakes / challenge (hearts) modes, XP + combo, coins, streaks, EN/FR sample decks.
- ✅ **Milestone 3 — AI chat deck builder**: send photos, PDFs or text (with a clear consent notice), Lumo keeps
  only what matters and shows *What I understood*; edit, untick or add concepts (or say “chapter 3 isn’t on the
  exam”), then build the deck. Follow-ups in plain words: “make it harder”, “quiz me on what I got wrong”,
  “explain osmosis again”, “make me a crossword”. Uploads are deleted as soon as the deck is built.
  Without an API key, typed notes and Quizlet/Anki text exports still work offline; photos/PDFs need the key.
- ✅ **Study Sandbox** — study any way you like; every format makes you *answer*, not just watch:
  - 🎬 Watch & listen: narrated explainer **video** (pause-and-predict checkpoints), two-host **podcast** with
    quick checks, interactive **mystery story**.
  - 🎮 Play: **quiz show** (deeper questions = more points), **escape room** (each answer unlocks a digit),
    **crossword**, **word search**, **memory match**, **word scramble**, 60-second **speed round**,
    **two truths & a lie**.
  - 🛠️ Review & remember: **flashcards** (think, flip, rate), **mind map** (explore, then test),
    printable **cheat sheet** with self-test, **memory tricks** (acronyms + silly sentences, then rebuild the list),
    **timeline** (follow, then rebuild from memory).
  - Ask for anything in plain words (“make me a crossword about osmosis”), in English or French.
  - XP once per activity, capped per day (games run on the device, so the server limits what they can earn).
- ✅ **Milestone 4 — Game systems** (all rewards granted server-side through one audited service):
  - **Leagues**: Bronze → Diamond, weekly groups of up to 30 at your level, live table with promotion/demotion
    zones, automatic end-of-week settlement (top move up, bottom move down, rewards), weekly global board.
  - **Levels** with coins and chests on level-up; **XP boost** item; **pet perk** (small, capped).
  - **Chests** (common/rare/epic) with an opening animation; loot rolled on the server.
  - **Pets**: adopt a starter, name it, feed it, level it up; 8 species from common to legendary; mood follows your
    streak and hunger; eggs hatch new pets.
  - **Shop**: streak freezes, heart refills, XP boosts, pet snacks, eggs, chests, color themes.
  - **Quests**: 3 daily + 2 weekly, different per learner, claim for coins/chests.
  - **Badges**: 17 achievements and lifetime stats on your profile; **streak repair** within 2 days.
  - Celebration pop-ups for level-ups, badges and finished quests.
- ✅ **Milestone 5 — Together**:
  - Friends: add by username, personal link or QR code; requests; friends' streaks, activity and a weekly
    leaderboard. Other learners never see your email.
  - Study groups (up to 50): invite code/link/QR, shared decks, a daily group quiz (same deck for everyone, first
    try counts), weekly ranking.
  - **Live** quiz games for 2–50 players over Socket.io: lobby with code + QR, the same varied question types as
    solo, server-owned timer, speed + streak points, reveal with explanation, podium with XP and coins for
    everyone. Answers are graded on the server; open answers get a short AI check with a built-in fallback.
- ✅ **Milestone 6 — Exam ready**:
  - **Mock exams**: the whole deck sampled evenly, timed (about a minute per question), no feedback until the
    end, hand in early or auto hand-in when time is up (enforced on the server). The report shows the score,
    readiness, weak spots, results by topic and by kind of thinking, and what to do next.
  - **Study plans**: pick an exam date and daily time; Lumo plans each day (new ideas first, reviews after 1, 3
    and 7 days, a mock exam two days before, a light last day) and shows today's plan on Home.
  - **Audio mode**: Lumo reads questions and answers aloud; answer out loud (speech recognition where the
    browser has it) or "just listen" like a podcast. Adjustable speed.
  - **Offline review**: save a deck to the device; rounds are generated and graded on the device with no
    connection and synced later (each batch counts once; small capped XP).
  - **Parents & teachers**: private, revocable progress links (streak, activity, decks, mock exams; never
    email, answers or chats).
  - **Reminders**: optional, one email a day only if you haven't studied, never at night. Off by default.
  - **My data**: download everything as JSON; delete the account and all data.

## Requirements
- Node 22+
- PostgreSQL 14+ (local install or `docker run -p 5432:5432 -e POSTGRES_PASSWORD=lumo postgres:16`)

## Setup
```bash
cd lumo
cp .env.example .env            # then fill in the values you have
npm install

# create the database (adjust if you use Docker)
createuser -s lumo; psql -c "ALTER USER lumo PASSWORD 'lumo'"
createdb -O lumo lumo; createdb -O lumo lumo_test

npm run db:migrate
npm run dev                     # API on :3001, web on http://localhost:5173
```

Without any keys, use **Developer sign-in** (dev only) or the email code (printed in the server log).

### Google sign-in
1. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* → Web application.
2. Authorized redirect URI: `http://localhost:5173/api/auth/google/callback` (and your production URL).
3. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`, restart the server.

### Anthropic
Set `ANTHROPIC_API_KEY` in `.env` (server only — it is never sent to the browser). Without a key, Lumo uses its
built-in offline question generator and keyword grader, so everything still works.
`AI_MODEL` (question writing) and `AI_GRADING_MODEL` (open-answer grading) default to `claude-opus-5-5`;
set `AI_GRADING_MODEL=claude-haiku-5-5` to make grading much cheaper.

## Tests
```bash
npm test             # core unit tests + API tests (needs the lumo_test database)
npm run typecheck
# browser tests (with `npm run dev` running):
npx playwright install chromium   # once
npx playwright test
# against the production build (also runs the offline/PWA test):
#   npm run build && WEB_DIST=apps/web/dist PORT=3002 APP_URL=http://localhost:3002 npm start
#   E2E_URL=http://localhost:3002 npx playwright test
```

## Deploy on Render (easiest)
The repo root has a `render.yaml` blueprint: on render.com choose **New → Blueprint**, pick this repository and
click **Apply**. It creates the app and a Postgres database, runs migrations and turns on "Try without an
account". Add `ANTHROPIC_API_KEY`, Google keys or `SMTP_URL` later under the service's **Environment** tab.

## Production
One Node process serves the API, Live games (WebSocket) and the built app.

```bash
npm ci
npm run build                      # builds apps/web/dist (code-split, PWA with offline cache)
NODE_ENV=production \
APP_URL=https://lumo.example.com API_URL=https://lumo.example.com \
SESSION_SECRET=$(openssl rand -hex 32) \
DATABASE_URL=postgres://… \
WEB_DIST=apps/web/dist \
ANTHROPIC_API_KEY=… GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… SMTP_URL=smtp://… \
npm start                          # runs migrations, then listens on PORT (3001)
```

- Put it behind HTTPS (e.g. Caddy or nginx) and forward WebSocket upgrades for `/api/live/socket`.
- Hashed assets are cached for a year; `index.html` and `sw.js` are always revalidated, so updates reach
  everyone on their next visit.
- Developer sign-in is disabled when `NODE_ENV=production`.
- Without `ANTHROPIC_API_KEY` the app still works with the built-in offline generator (photos/PDFs need AI).

## Layout
```
packages/core   pure TypeScript rules shared by server and app (unit-tested)
apps/server     Fastify + PostgreSQL + (soon) Socket.io and Claude
apps/web        React + Tailwind PWA
e2e             Playwright browser tests
```
