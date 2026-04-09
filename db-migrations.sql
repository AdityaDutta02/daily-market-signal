-- db-migrations.sql
-- Runs once at deploy time against the app's isolated Postgres schema.
-- PostgreSQL 16: gen_random_uuid() and JSONB are available out of the box.

CREATE TABLE IF NOT EXISTS items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
