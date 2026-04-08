-- db-migrations.sql
-- Runs once at deploy time against the app's isolated Postgres schema.

CREATE TABLE IF NOT EXISTS user_preferences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tickers       JSONB NOT NULL DEFAULT '[]',
  presets       JSONB NOT NULL DEFAULT '[]',
  schedule_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
  schedule_time TEXT NOT NULL DEFAULT '08:00',
  timezone      TEXT NOT NULL DEFAULT 'America/New_York',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tickers     JSONB NOT NULL DEFAULT '[]',
  presets     JSONB NOT NULL DEFAULT '[]',
  token_usage JSONB NOT NULL DEFAULT '{}',
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
