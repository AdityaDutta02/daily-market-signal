CREATE TABLE IF NOT EXISTS items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
