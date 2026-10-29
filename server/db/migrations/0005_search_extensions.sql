-- Food search (plan.md, branch food-search, Q31). Written by hand: drizzle-kit
-- manages neither extensions nor functions (docs/research/drizzle-pg-trgm-search.md).
-- Must run before 0006, whose index calls nutrisa_unaccent.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- unaccent() is STABLE, and an index expression only takes IMMUTABLE functions.
-- The two-argument form with a fixed dictionary does not depend on the session,
-- so this wrapper may say IMMUTABLE. Everything inside is schema-qualified because
-- CREATE INDEX runs it with search_path set to pg_catalog, pg_temp.
CREATE OR REPLACE FUNCTION public.nutrisa_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
