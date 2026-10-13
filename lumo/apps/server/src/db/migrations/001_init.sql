CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text UNIQUE,
  google_sub      text UNIQUE,
  username        text NOT NULL UNIQUE,
  avatar          text NOT NULL DEFAULT 'firefly-amber',
  locale          text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'fr')),
  timezone        text NOT NULL DEFAULT 'UTC',
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  xp              integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  coins           integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
  hearts          integer NOT NULL DEFAULT 5,
  hearts_updated_at timestamptz NOT NULL DEFAULT now(),
  streak          jsonb NOT NULL DEFAULT '{"days":0,"lastDay":null,"freezes":0,"lost":null}'::jsonb,
  league_tier     text NOT NULL DEFAULT 'bronze',
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_codes (
  email       text PRIMARY KEY,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0
);
