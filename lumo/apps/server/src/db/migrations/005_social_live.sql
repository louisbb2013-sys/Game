-- Personal invite code for adding friends by link or QR code.
ALTER TABLE users ADD COLUMN friend_code text UNIQUE DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
UPDATE users SET friend_code = upper(substr(md5(random()::text || id::text), 1, 8)) WHERE friend_code IS NULL;

CREATE TABLE friendships (
  user_a       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('pending', 'accepted')),
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX friendships_b_idx ON friendships (user_b);

CREATE TABLE study_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id  uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user_idx ON group_members (user_id);

CREATE TABLE group_decks (
  group_id  uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  deck_id   uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  added_by  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, deck_id)
);

CREATE TABLE group_daily (
  group_id  uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  day       text NOT NULL,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  correct   integer NOT NULL,
  answered  integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, day, user_id)
);

-- Finished Live games (running games live in server memory; codes are reused).
CREATE TABLE live_games (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL,
  host_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id    uuid REFERENCES decks(id) ON DELETE SET NULL,
  title      text NOT NULL,
  status     text NOT NULL DEFAULT 'lobby',
  results    jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz
);
