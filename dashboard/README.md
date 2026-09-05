# AI OS — Personal Command Center

A single-page dashboard that puts your connected tools (mail, calendar,
files, payments, domains, messages) behind one home screen, styled like a
minimal operating system: a status bar with a command input, a bento grid
of tool cards, and a dock for quick launch.

Open `index.html` in a browser — no build step, no server required.

## Why everything on screen is sample data

This repository is **public**. Baking real inbox contents, calendar
events, or transaction history into committed files would put that data
permanently in GitHub's history for anyone to see. So this dashboard ships
with clearly-labeled placeholder data (`js/data.js`) instead, and the
"Connections" panel only toggles a local UI flag (saved to
`localStorage` in your own browser) — it never performs a real sign-in.

To see **real** data from a connected tool (e.g. your actual inbox), ask
in a Claude Code session that has that tool's connector enabled — Claude
can pull a live snapshot into the conversation. That snapshot stays in
the chat; it's deliberately never written back into this repo.

## Wiring up a real, standalone integration

A static page like this one can't hold API credentials safely — anything
shipped in the HTML/JS is visible to every visitor. A real integration
needs:

1. An OAuth app registered with the provider (Google, Microsoft, Square,
   GoDaddy, etc.), or for iCloud specifically, an
   [app-specific password](https://support.apple.com/en-us/102654) since
   Apple has no OAuth API for Mail — it's IMAP (`imap.mail.me.com:993`) /
   SMTP (`smtp.mail.me.com:587`) only.
2. A small backend that holds the client secret / app password, performs
   the OAuth token exchange or IMAP login, and exposes a minimal JSON API
   for this page to call.
3. This dashboard's `js/app.js` swapped from reading `SAMPLE_DATA` to
   fetching from that backend.

## Structure

- `index.html` — layout: status bar, sample-data banner, card grid, dock,
  connections modal.
- `css/style.css` — design tokens (light/dark), bento grid, card styles.
- `js/data.js` — sample content and the list of connectable tools.
- `js/app.js` — rendering, mail-tab switching, the connections toggle
  (localStorage only), and the command bar mockup.
