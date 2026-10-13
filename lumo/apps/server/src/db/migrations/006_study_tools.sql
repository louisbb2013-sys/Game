-- Study plans: one exam date per deck.
CREATE TABLE study_plans (
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id         uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  exam_day        text NOT NULL,
  minutes_per_day integer NOT NULL DEFAULT 20,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, deck_id)
);

-- Read-only progress links for parents and teachers (revocable, no personal data).
CREATE TABLE share_links (
  token          text PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label          text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz,
  revoked_at     timestamptz
);
CREATE INDEX share_links_user_idx ON share_links (user_id);

-- Offline review batches already applied (a retried sync must not count twice).
CREATE TABLE offline_syncs (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

ALTER TABLE users ADD COLUMN last_reminder_day text;
