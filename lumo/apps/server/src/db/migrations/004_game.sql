ALTER TABLE users
  ADD COLUMN stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN boost_until timestamptz,
  ADD COLUMN theme text NOT NULL DEFAULT 'default';

CREATE TABLE inventory (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id   text NOT NULL,
  qty       integer NOT NULL DEFAULT 0 CHECK (qty >= 0),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE chests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('common', 'rare', 'epic')),
  source     text NOT NULL,
  contents   jsonb,
  opened_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chests_user_idx ON chests (user_id, opened_at);

CREATE TABLE pets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  species    text NOT NULL,
  name       text NOT NULL,
  level      integer NOT NULL DEFAULT 1,
  xp         integer NOT NULL DEFAULT 0,
  fullness   integer NOT NULL DEFAULT 100,
  fed_at     timestamptz NOT NULL DEFAULT now(),
  equipped   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pets_user_idx ON pets (user_id);
CREATE UNIQUE INDEX pets_one_equipped ON pets (user_id) WHERE equipped;

CREATE TABLE user_quests (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id   text NOT NULL,
  period_key text NOT NULL,
  progress   integer NOT NULL DEFAULT 0,
  target     integer NOT NULL,
  claimed    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, quest_id, period_key)
);

CREATE TABLE user_badges (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   text NOT NULL,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE league_groups (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id   text NOT NULL,
  tier      text NOT NULL,
  settled   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX league_groups_week_idx ON league_groups (week_id, tier);

CREATE TABLE league_members (
  group_id    uuid NOT NULL REFERENCES league_groups(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_id     text NOT NULL,
  weekly_xp   integer NOT NULL DEFAULT 0,
  last_xp_at  timestamptz NOT NULL DEFAULT now(),
  final_rank  integer,
  outcome     text,
  seen        boolean NOT NULL DEFAULT false,  -- learner has seen the end-of-week result
  PRIMARY KEY (group_id, user_id),
  UNIQUE (user_id, week_id)
);
CREATE INDEX league_members_group_idx ON league_members (group_id, weekly_xp DESC);
