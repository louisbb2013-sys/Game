# Lumo on Netlify

Your Lumo website: **https://lumo-study-qwd6.netlify.app**

It works the moment it's deployed, with nothing else to set up:
- **Accounts:** a Lumo name + password, so progress, decks and pets follow you to any phone or computer. People can also try it without an account (saved on that device only).
- **Friends:** add each other by Lumo name or with an invite link (`/add/<name>`); the other person gets a friend request to add you back. Share decks (their questions come along, so a friend's copy plays right away), see who's online, play Live. On the website you only ever see the friends you added: no list of strangers. A Live host invites friends with one tap (they get a pop-up and join, no code). A deck can be Only me, Friends or Public (anyone on Lumo finds it under Public decks, and it gets a link).
- **AI:** Claude makes decks from a topic, a PDF, photos or notes, and writes the questions. With nothing set up it goes through Netlify's AI Gateway, paid from the site's free monthly credits (see below).

Everything is kept in the site's own Netlify storage (Netlify Blobs). No Firebase or other account needed.

---

## Turn on "Continue with Google" (optional, 2 minutes)

1. Open <https://app.netlify.com/projects/lumo-study-qwd6/identity> and click **Enable Identity**.
2. Under **Registration** → **External providers**, click **Add provider** → **Google** → **Use default configuration** → **Enable**.
3. Done: the Google button appears on the sign-in screen by itself. Google accounts keep no e-mail or real name in Lumo.

## AI: free allowance or your own key

- **Netlify credits (default):** Claude runs through Netlify's AI Gateway and uses the team's credits (Free: 300 a month; Personal: 1000), **shared with the team's other sites** (bakyos.ca). Netlify **pauses every site if they run out**, so Lumo stops using AI for the month once `LUMO_AI_MONTHLY_USD` has been spent (default $0.75; this site is set to **$1**, about 180 credits). The month starts on `LUMO_AI_RESET_DAY`, the day the team's credits renew (this site: **17**); without it, on the 1st.
- **No paid web search on shared credits:** web search costs about a cent per search, so through the gateway decks are built from what Claude knows. `LUMO_AI_WEB_SEARCH=on` turns it back on (with your own key it is always on).
- **Background checks:** the site checks for new friends' decks, invites and game moves at a calm pace (every 10–15 s, every 1–2 s only during a Live game, never while the tab is hidden), since every check is a request Netlify counts.
- **Unlimited:** an adult creates a key at <https://console.anthropic.com> (pay as you go) and adds it in Netlify: **Project configuration → Environment variables → Add a variable**, key `ANTHROPIC_API_KEY`, marked **secret**. Lumo then uses that key and the monthly cap no longer applies. Never paste the key in a chat.
- **Model:** `CLAUDE_MODEL`. This site uses **`claude-haiku-5-5`** (about 40 times cheaper: roughly a cent per deck without web search, so about 100 decks a month within the $1 cap). Without the variable it's `claude-opus-5-5` (the best questions, but only a few decks a month for free).

## Credits and deploys

Each published version of the site (a "production deploy") costs **15 credits**. So that work in progress doesn't use them up, Netlify only publishes a new version when the latest commit message contains **`[deploy]`** (see `ignore` in `netlify.toml`). To publish by hand: Netlify → **Deploys** → **Trigger deploy** → **Deploy site**.

## How it's built (for developers)

- `netlify.toml` (repository root): builds `apps/web` with `npm run build:netlify` and publishes `apps/web/dist-netlify`.
- `netlify/functions/auth.mts` → `/api/auth/*`: sign up, log in (PBKDF2 password hashes), Google through Netlify Identity.
- `netlify/edge-functions/data.ts` → `/api/data`, `/api/room`: shared documents and live-room presence with the same access rules as the Claude page (everyone reads profiles/decks/games, each learner writes only their own; `data/users/<id>` is private).
- `netlify/edge-functions/claude.ts` → `/api/claude`: Claude, streamed, for signed-in learners only, with the monthly gateway budget.
- `apps/web/src/netlify/cloud.ts`: the page side (the same `window.claude.use(...)` surface the app uses inside Claude).
- Tests: `npm run test:netlify` (server code) and `e2e/netlify.spec.ts` against `npx tsx e2e/fixtures/netlify-serve.ts apps/web/dist-netlify`.
