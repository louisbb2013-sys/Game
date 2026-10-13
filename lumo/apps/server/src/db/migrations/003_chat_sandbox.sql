CREATE TABLE chats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id     uuid REFERENCES decks(id) ON DELETE SET NULL,
  title       text NOT NULL DEFAULT '',
  draft       jsonb,          -- "What I understood": deck being prepared, editable by the learner
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chats_user_idx ON chats (user_id, updated_at DESC);

CREATE TABLE chat_messages (
  id          bigserial PRIMARY KEY,
  chat_id     uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id, kind, name}]
  card        jsonb,                                -- structured UI card (draft, deck created, quiz/sandbox suggestion)
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_chat_idx ON chat_messages (chat_id, id);

-- Uploaded notes. Kept only until the deck is built, then deleted (privacy first).
CREATE TABLE uploads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id     uuid REFERENCES chats(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('image', 'pdf', 'text')),
  mime        text NOT NULL,
  name        text NOT NULL DEFAULT '',
  bytes       bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uploads_chat_idx ON uploads (chat_id);

CREATE TABLE sandbox_activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id      uuid REFERENCES decks(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  title        text NOT NULL,
  data         jsonb NOT NULL,
  score        real,
  xp           integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sandbox_user_idx ON sandbox_activities (user_id, created_at DESC);
