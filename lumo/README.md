# Lumo ✨ — study smarter, understand deeper

Lumo turns your notes into quizzes that help you **truly understand**, not memorize by heart.
Mascot: **Lumo the firefly**, whose light grows as you master ideas.

See [PLAN.md](PLAN.md) for architecture, data model and milestones.

## Status
- ✅ **Milestone 1 — Foundation**: monorepo, core game/learning rules (spaced repetition, mastery, XP & levels,
  streaks, hearts, leagues, safe usernames), Fastify API with Google / email-code / dev sign-in, PWA shell
  (EN/FR, dark mode, dyslexia font, larger text, reduced motion, delete-my-data).
- ⏳ Milestones 2–6: quiz engine, AI deck builder, game systems, social & Live, extras.

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
Set `ANTHROPIC_API_KEY` in `.env` (server only — it is never sent to the browser). Used from Milestone 2.

## Tests
```bash
npm test             # core unit tests + API tests (needs the lumo_test database)
npm run typecheck
# browser tests (with `npm run dev` running):
npx playwright install chromium   # once
npx playwright test
```

## Layout
```
packages/core   pure TypeScript rules shared by server and app (unit-tested)
apps/server     Fastify + PostgreSQL + (soon) Socket.io and Claude
apps/web        React + Tailwind PWA
e2e             Playwright browser tests
```
