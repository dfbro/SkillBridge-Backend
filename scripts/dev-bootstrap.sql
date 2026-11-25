-- Local-only Supabase Auth compatibility fixture.
-- Never apply this file to a Supabase project: Supabase owns auth.users.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email varchar(320) UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA auth TO skillbridge_app;
GRANT SELECT ON auth.users TO skillbridge_app;
