# Lumo — Plan

**Lumo** is a study app that helps students *understand* their material, not memorize it.
Mascot: **Lumo the firefly** — a small glowing firefly whose light grows as you master ideas.
Palette: warm amber (`#F5A524`) on deep indigo (`#1E1B4B`), soft cream background in light mode.

---

## 1. Architecture

```
lumo/
├─ packages/core      Pure TypeScript domain logic. No I/O. Fully unit-tested.
│                     SRS scheduler, mastery, quiz planner, local graders,
│                     XP/levels, streaks, hearts, leagues, chests, Live game state.
├─ apps/server        Node 22 + Fastify 5 + PostgreSQL (pg, SQL migrations)
│                     + Socket.io (Live) + Anthropic SDK (AI). REST + WebSocket.
└─ apps/web           React 19 + TypeScript + Tailwind 4 + Vite, mobile-first PWA.
                      i18n (EN/FR), dark mode, dyslexia font, large text.
```

**Why these choices**
- **Shared `core` package**: the same quiz/grading/game rules run on the server (authoritative, anti-cheat)
  and on the client (offline review, instant feedback). It has no DOM/Node dependencies, so a future
  React Native/Expo app can import it unchanged.
- **Self-hosted Fastify + Postgres** instead of a BaaS: everything runs locally with one command, the
  server is the single source of truth for XP/coins/league scoring (anti-cheat), and it deploys to
  Fly/Render/any VPS.
- **Plain SQL migrations with `pg`**: transparent schema, no ORM lock-in, easy to review.
- **Socket.io** for Live: rooms, reconnection, and fallback transports out of the box; scales to 50 players
  per room easily. Adapter can be swapped for Redis later for multi-instance.
- **AI behind an interface** (`AiProvider`): `ClaudeProvider` (real) and `MockProvider` (deterministic, used in
  tests and when no key is set). The API key never leaves the server.

## 2. Auth
- **Google OAuth 2.0** (authorization-code flow, server-side; ID token verified against Google JWKS).
- **Email one-time code** fallback (code emailed via SMTP; printed to server log in dev).
- **Dev login** (only when `NODE_ENV !== 'production'`) to test without any keys.
- Session = signed JWT in an `httpOnly`, `SameSite=Lax` cookie.
- Minors-safe defaults: usernames are generated (`AmberOtter42`), editable through a filter; no real names or
  emails are ever shown to other users; profiles are friends-only by default.

## 3. Data model (Postgres)

| Table | Purpose |
|---|---|
| `users` | id, email, google_sub, username, avatar, locale, settings (jsonb), xp, coins, hearts, hearts_updated_at, streak_days, streak_last_day, streak_freezes, league_tier, created_at |
| `email_codes` | email, code_hash, expires_at, attempts |
| `friendships` | user_a, user_b, status (pending/accepted), requested_by |
| `groups`, `group_members` | study groups |
| `decks` | id, owner_id, title, subject, language, visibility (private/friends/public/link), share_token, source_summary |
| `topics` | id, deck_id, name, order |
| `concepts` | id, deck_id, topic_id, kind (definition/process/cause_effect/formula/comparison/date/vocab), title, content (jsonb: facts, key points, misconceptions, steps, pairs…) |
| `concept_states` | user_id, concept_id, FSRS stability/difficulty/due, bloom_level, formats_passed (jsonb), mastery 0–1, last_format |
| `attempts` | user_id, concept_id, question (jsonb snapshot), format, bloom, answer, score, time_ms, created_at |
| `chats`, `chat_messages`, `uploads` | AI tutor conversations, uploaded images/PDFs (consent flag) |
| `xp_events` | user_id, amount, reason, week_id — the ledger behind leagues and leaderboards |
| `league_groups`, `league_members` | weekly cohorts of ~30 per tier, weekly_xp, final_rank, outcome |
| `inventory` | user_id, item_id, qty (streak freezes, boosts, cosmetics, chest keys) |
| `chests` | user_id, kind, source, opened_at, contents |
| `pets` | user_id, species, name, level, xp, hunger, cosmetics, equipped |
| `quests`, `user_quests`, `badges`, `user_badges` | daily/weekly quests & achievements |
| `live_games` | code, host_id, deck_id, settings, status, results (jsonb) |
| `study_plans` | user_id, deck_id, exam_date, plan (jsonb) |

## 4. The quiz engine (core of the app)

**Concepts, not cards.** The AI extracts *concepts* (with facts, key points, common misconceptions,
examples). Questions are **generated on the fly** from a concept + a chosen format + a Bloom level.

**Planner** (`core/quiz/planner.ts`) picks the next item:
1. Due concepts first (FSRS-style scheduler), then weak ones, then new ones (interleaved by topic).
2. Choose a **Bloom level** from mastery: remember → understand → apply → analyze.
3. Choose a **format** compatible with the concept kind and Bloom level, **never the same format as last time for
   that concept**, and preferring formats not yet passed.
4. Ask the AI provider for a **fresh variant** (new wording, numbers, scenario, distractors from known
   misconceptions), validated with Zod. A short-lived cache prevents identical repeats; a question-hash
   history per user guarantees no identical question twice in a row.

**16 formats**: multiple choice, multiple select, type-the-answer, fill-in-the-blank, explain-in-your-own-words,
true/false + justification, matching, ordering, categorize, label-the-diagram, spot-the-mistake,
cause→effect scenario, apply-to-new-situation, calculation (step-graded), compare & contrast, teach-it-back.

**Grading**: closed formats graded locally & deterministically in `core` (server re-grades for scoring).
Open formats graded by AI against key points → `{score 0–1, matchedPoints, missingPoints, feedback}`; local
fuzzy matching (normalization, accents, Levenshtein, synonyms list) handles typed short answers without an AI call.

**Mastery**: a concept is *mastered* only when it has been answered correctly in **≥3 distinct formats** spanning
**≥2 Bloom levels**, with the latest attempt correct. Wrong answers → shorter interval + immediate
similar-but-different retry + kind explanation.

**Exam mode**: timed, mixed, no hints; ends with a report (weak concepts, error patterns, study plan).

## 5. Game systems (all server-authoritative, rules in `core`)
- XP per answer: base by format difficulty × Bloom multiplier, + first-try bonus, × combo multiplier (in-quiz streak).
- Levels: `xpForLevel(n) = 50·n^1.6` (rounded), with unlock rewards (chests, pets slots, cosmetics).
- Leagues: Bronze → Silver → Gold → Sapphire → Ruby → Emerald → Amethyst → Diamond. Weekly (Mon 00:00 UTC) cohorts of ≤30.
  Top 7 promoted, bottom 5 demoted (none from Bronze / none promoted from Diamond), rest stay.
- Day streak (timezone-aware), streak freezes, one free weekend-protection per month, paid repair within 48h.
- Hearts: max 5, −1 per wrong answer **only in "challenge" sessions**, +1 every 30 min, +1 per review
  session completed; review/practice mode never costs hearts. Learning is never blocked.
- Coins, chests (common/rare/epic; weighted loot tables), pets (feed/level/name; mood follows streak; small perks),
  shop, daily/weekly quests, badges. Rate limits + server-side scoring for anti-cheat.

## 6. Live (multiplayer)
Socket.io rooms keyed by a 6-char join code (also link + QR). State machine in `core/live`:
`lobby → question → reveal → leaderboard → … → podium`. Server holds the authoritative state & timer;
score = correctness × (500 + 500 × time-remaining-ratio) × streak bonus. All non-teach-it-back formats work
in Live (open answers are graded by the AI during the reveal phase, with a timeout fallback to local fuzzy grading). 2–50 players.

## 7. AI (Anthropic Claude)
- Model: `claude-opus-5-5` by default for extraction, generation and grading, at low effort (configurable per
  task via `AI_MODEL` / `AI_GRADING_MODEL`, e.g. `claude-haiku-5-5` for cheap grading). Server-side refusal
  fallback enabled on models that support it.
- Tool use / structured JSON output, validated with Zod; one automatic repair retry on invalid output.
- Vision for photos/scans; PDFs sent as document blocks.
- Cost control: per-user daily quotas (free tier), response cache keyed by (concept, format, bloom, seed),
  prompt caching for deck context, rate limiting.
- Moderation: chat input/output pass through a safety check; usernames filtered.

## 7b. Study Sandbox (added on request)
Any study format, generated from the deck's concepts: video, podcast, story, quiz show, escape room, crossword,
word search, memory match, word scramble, speed round, two truths & a lie, flashcards, mind map, cheat sheet,
memory tricks, timeline. Design rule from learning research (retrieval practice, spacing, elaboration, concrete
examples, dual coding): **every format includes active recall**: videos and podcasts pause for questions, the
mind map, cheat sheet, memory tricks and timeline all end in a self-test. Generators live in `core/sandbox`
(offline, deterministic, tested); Claude rewrites the scripts for video/podcast/story/memory tricks when a key is set.

## 8. Milestones
1. **Foundation** — monorepo, `core` (SRS, mastery, XP/levels, streaks, hearts, leagues) with tests; server with
   migrations, Google + email + dev auth, `/me`; web PWA shell with Lumo branding, EN/FR, dark mode,
   dyslexia font, large text; sign-in → home → profile.
2. **Decks & quiz engine** — concept model, planner, all 16 formats (generator + graders), mock + Claude
   providers, solo quiz UI with drag-and-drop, explanations, retries, combo effects, mastery map.
3. **AI chat deck builder** — tutor chat, multi-image/PDF upload with consent, "What I understood" review,
   edit/include/exclude, build deck + quiz, follow-ups ("harder", "only what I got wrong").
4. **Game systems** — XP ledger, levels, leagues weekly job, leaderboards, streaks & freezes, hearts, coins,
   chests, pets, shop, quests, badges.
5. **Social & Live** — friends (username/link/QR), groups, group daily quiz, Live multiplayer with podium.
6. **Beyond** — exam mode + report, study plan generator, audio mode (TTS/STT), offline review, share links,
   reminders, privacy (export/delete my data), animations & sounds, polish and performance.

Each milestone ends with: typecheck, unit tests, a running app checked in a real browser (Playwright).
