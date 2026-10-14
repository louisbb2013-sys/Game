# Put Lumo online (Netlify + Google sign-in)

You end up with your own Lumo website (`something.netlify.app`) that:
- your friends can open on any phone or computer, and add to their home screen like an app;
- saves each person's progress to their Google account;
- lets you add friends, share decks and play Live together;
- makes quizzes from photos, notes or just a topic (Claude does the research).

It takes about 20 minutes, once. You need three free accounts: **Firebase** (Google), **Anthropic** (Claude, pay-as-you-go), and **Netlify**.

---

## 1. Firebase: Google sign-in and saving (free)

1. Go to <https://console.firebase.google.com> and sign in with Google.
2. **Create a project.** Name it `lumo`. Turn off Google Analytics (not needed). Click **Create project**.
3. **Turn on Google sign-in.**
   1. In the left menu, open **Build → Authentication → Get started**.
   2. Under **Sign-in method**, choose **Google**, switch it **on**, pick your email as the support email, and click **Save**.
4. **Make the database for progress.**
   1. Open **Build → Firestore Database → Create database**.
   2. Choose a location near you (for Québec: `northamerica-northeast1 (Montréal)`), then **Start in production mode**, then **Create**.
   3. Open the **Rules** tab. Delete everything there and paste the contents of [`firebase/firestore.rules`](firebase/firestore.rules). Click **Publish**.
5. **Make the database for Live games.**
   1. Open **Build → Realtime Database → Create database**.
   2. Pick the location, then **Start in locked mode**, then **Enable**.
   3. Open the **Rules** tab and paste the contents of [`firebase/database.rules.json`](firebase/database.rules.json). Click **Publish**.
6. **Get the web settings.**
   1. Click the gear ⚙️ (top left), then **Project settings**.
   2. Under **Your apps**, click the **`</>`** (Web) icon. Name it `Lumo web` (no hosting needed) and click **Register app**.
   3. Copy the whole `const firebaseConfig = { … };` block. You'll paste it into Netlify in step 3.
   4. Also note the **Project ID** shown on that page (for example `lumo-1a2b3`).

> Do step 5 *before* step 6. The settings block then includes the `databaseURL` that Live games need.

## 2. Claude: an API key (pay per use)

1. Go to <https://console.anthropic.com> and sign in.
2. Open **Settings → Billing** and add a little credit (for example $10).
3. Set a **monthly spend limit** so it can never cost more than you want.
4. Open **API keys → Create key**, name it `lumo`, and copy it. It starts with `sk-ant-`.

Roughly, building one deck from a topic or photos costs a few cents. Checking answers costs a fraction of a cent.

## 3. Netlify: the website

1. Go to <https://app.netlify.com> and sign up **with GitHub**.
2. Click **Add new project → Import an existing project → GitHub**.
3. Pick the repository **`louisbb2013-sys/Game`** and the branch **`claude/game-development-pdv2i2`**. Netlify reads the rest of the settings from `netlify.toml`, so leave them as they are.
4. Before deploying, open **Environment variables** (or after: **Project configuration → Environment variables**) and add these three:

   | Key | Value |
   | --- | --- |
   | `VITE_FIREBASE_CONFIG` | the whole `firebaseConfig = { … }` block from step 1.6 |
   | `FIREBASE_PROJECT_ID` | your Firebase project ID (for example `lumo-1a2b3`) |
   | `ANTHROPIC_API_KEY` | the `sk-ant-…` key from step 2 |

5. Click **Deploy**. After about 2 minutes you get an address like `https://lumo-xyz.netlify.app`.
   - To choose a nicer name: **Project configuration → Change project name**.
   - If you added the variables after the first deploy: **Deploys → Trigger deploy → Deploy project**.

## 4. Allow your website to use Google sign-in

1. In Firebase, go to **Authentication → Settings → Authorized domains → Add domain**.
2. Add your Netlify address **without** `https://` (for example `lumo-xyz.netlify.app`).

## 5. Use it

- Open your Netlify address and tap **Continue with Google**.
- **On a phone, add it to the home screen** so it opens like an app.
  - iPhone: tap **Share → Add to Home Screen**.
  - Android: tap the **⋮** menu, then **Add to Home screen** or **Install app**.
- Send the address to your friends. Each person signs in with their own Google account.
- On **Me → Friends**, type a friend's username and press Enter.

## If something doesn't work

| What you see | What to do |
| --- | --- |
| "This site isn't allowed to sign in yet" | Do step 4 (Authorized domains). |
| Making a quiz from a topic or photos fails | Check `ANTHROPIC_API_KEY` in Netlify and the credit in your Anthropic account. |
| Live games don't show up | Check that the Realtime Database exists (step 1.5). Copy the `firebaseConfig` block again so it includes `databaseURL`, update `VITE_FIREBASE_CONFIG`, and redeploy. |
| Sign-in button does nothing | Check that `VITE_FIREBASE_CONFIG` is set, then redeploy. |

## Privacy and costs

- **What other players see:** only your Lumo username and study stats. Google names, emails and photos are never shown to them.
- **Who can change what:** each learner can only change their own data. The rules in `firebase/` enforce this.
- **Firebase:** the free plan covers a group of friends easily.
- **Claude:** only signed-in learners can use it, with a limit per person, and your spend limit caps the total.
