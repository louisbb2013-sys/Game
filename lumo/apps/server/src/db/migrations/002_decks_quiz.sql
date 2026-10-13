CREATE TABLE decks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  subject      text NOT NULL DEFAULT '',
  language     text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'fr')),
  visibility   text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'friends', 'public', 'link')),
  share_token  text UNIQUE,
  summary      text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decks_owner_idx ON decks (owner_id, updated_at DESC);

CREATE TABLE concepts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id     uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX concepts_deck_idx ON concepts (deck_id, position);

CREATE TABLE concept_states (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id  uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  progress    jsonb NOT NULL,
  srs         jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, concept_id)
);

CREATE TABLE quiz_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id     uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  mode        text NOT NULL,
  state       jsonb NOT NULL,
  current     jsonb,           -- the question being asked, WITH its answer key (never sent as-is)
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_sessions_user_idx ON quiz_sessions (user_id, created_at DESC);

CREATE TABLE attempts (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id   uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES quiz_sessions(id) ON DELETE SET NULL,
  format       text NOT NULL,
  bloom        text NOT NULL,
  variant_key  text NOT NULL,
  score        real NOT NULL,
  time_ms      integer,
  question     jsonb NOT NULL,
  answer       jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attempts_user_concept_idx ON attempts (user_id, concept_id, created_at DESC);

CREATE TABLE xp_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      integer NOT NULL,
  reason      text NOT NULL,
  week_id     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX xp_events_week_idx ON xp_events (week_id, user_id);
