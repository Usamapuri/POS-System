-- Destroys ALL data in the public schema. Use on Railway Postgres when you want a clean slate.
-- After this, redeploy or restart the backend: it will run embedded bootstrap if public.users is missing.
--
-- Run locally (from project root, with Railway CLI linked):
--   railway run psql $DATABASE_URL -f scripts/reset-railway-public-schema.sql
--
-- Or paste into Railway → Postgres → Query / Data → SQL editor.

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
