# Lumo on Netlify

Your Lumo website: **https://lumo-study-qwd6.netlify.app**

It works the moment it's deployed, with nothing else to set up:
- **Accounts:** a Lumo name + password, so progress, decks and pets follow you to any phone or computer. People can also try it without an account (saved on that device only).
- **Friends:** add each other by Lumo name, share decks, see who's online, play Live. On the website you only ever see the friends you added: no list of strangers.
- **AI:** Claude makes decks from a topic, a PDF, photos or notes, and writes the questions. With nothing set up it goes through Netlify's AI Gateway, paid from the site's free monthly credits (see below).

Everything is kept in the site's own Netlify storage (Netlify Blobs). No Firebase or other account needed.

---

## Turn on "Continue with Google" (optional, 2 minutes)

1. Open <https://app.netlify.com/projects/lumo-study-qwd6/identity> and click **Enable Identity**.
2. Under **Registration** → **External providers**, click **Add provider** → **Google** → **Use default configuration** → **Enable**.
3. Done: the Google button appears on the sign-in screen by itself. Google accounts keep no e-mail or real name in Lumo.

## AI: free allowance or your own key

- **Free (default):** Claude runs through Netlify's AI Gateway and uses the site's credits. A free Netlify site has **300 credits a month** and **pauses if they run out**, so Lumo stops using AI for the month after **$0.75** of AI (about 135 credits). Change that with the `LUMO_AI_MONTHLY_USD` environment variable.
- **Unlimited:** an adult creates a key at <https://console.anthropic.com> (pay as you go) and adds it in Netlify: **Project configuration → Environment variables → Add a variable**, key `ANTHROPIC_API_KEY`, marked **secret**. Lumo then uses that key and the monthly cap no longer applies. Never paste the key in a chat.
- **Model:** `CLAUDE_MODEL` (default `claude-opus-5-5`, the best questions). `claude-haiku-5-5` costs about 40 times less, so the free allowance makes many more decks.

## Credits and deploys

Each published version of the site (a "production deploy") costs **15 credits**. So that work in progress doesn't use them up, Netlify only publishes a new version when the latest commit message contains **`[deploy]`** (see `ignore` in `netlify.toml`). To publish by hand: Netlify → **Deploys** → **Trigger deploy** → **Deploy site**.

## How it's built (for developers)

- `netlify.toml` (repository root): builds `apps/web` with `npm run build:netlify` and publishes `apps/web/dist-netlify`.
- `netlify/functions/auth.mts` → `/api/auth/*`: sign up, log in (PBKDF2 password hashes), Google through Netlify Identity.
- `netlify/edge-functions/data.ts` → `/api/data`, `/api/room`: shared documents and live-room presence with the same access rules as the Claude page (everyone reads profiles/decks/games, each learner writes only their own; `data/users/<id>` is private).
- `netlify/edge-functions/claude.ts` → `/api/claude`: Claude, streamed, for signed-in learners only, with the monthly gateway budget.
- `apps/web/src/netlify/cloud.ts`: the page side (the same `window.claude.use(...)` surface the app uses inside Claude).
- Tests: `npm run test:netlify` (server code) and `e2e/netlify.spec.ts` against `npx tsx e2e/fixtures/netlify-serve.ts apps/web/dist-netlify`.
