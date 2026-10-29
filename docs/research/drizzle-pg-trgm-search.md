# Trigram + unaccent search index with Drizzle

Research only, 2026-10-29. Nothing was installed, run, or migrated; no database was contacted.
The only file written is this one.

## Versions

| | | |
|---|---|---|
| `drizzle-orm` | **0.45.2** | `node_modules/drizzle-orm/package.json` (package.json range `^0.45.2`), **verified** |
| `drizzle-kit` | **0.31.10** | `node_modules/drizzle-kit/package.json` (range `^0.31.10`), **verified** |
| Postgres | **unknown** | Nothing in the repo, migrations or snapshots names the server version. Docs cited at `/docs/17/`. Neon offers the same `pg_trgm` 1.6 / `unaccent` 1.1 on PG14 to PG18, so the answer does not depend on it |
| Migration journal | dialect `postgresql`, version `7`, `breakpoints: true`, last entry `0004_massive_the_enforcers` | `server/db/migrations/meta/_journal.json`, **verified** |

Drizzle's website is unversioned (it currently advertises v1 beta and shows a folder-per-migration
layout this repo does not use), so the installed code is the authority below, not the website.

## Contradictions with plan.md: read these first

1. **plan.md ~line 2440, "Drizzle 0.45 writes the index as `index(...).using("gin", table.col.op("gin_trgm_ops"))`"**:
   that is the syntax for a **plain column** only. It emits `USING gin ("name" gin_trgm_ops)` and
   cannot express `unaccent`/`lower`. `.op()` exists only on `ExtraConfigColumn`
   (`node_modules/drizzle-orm/pg-core/columns/common.d.ts:103`); a `sql` index element has no
   opclass slot at all (drizzle-kit `bin.cjs:17163-17169` returns `{expression, asc, isExpression, nulls}`
   for SQL, no `opclass`). For an expression index the opclass must be written **inside the `sql`
   template**. **Verified.**
2. **plan.md Q31, "any word prefixes a word of its name or brand"**: `foods` has **no `brand`
   column** (`server/db/schema.ts:202-219`), and `foodFromRow` hard-codes `brand: null`
   (`server/food/rows.ts:52`). Brand search needs a new column (or brand kept inside `name`) and
   a decision. **Verified.**
3. **plan.md Q31 typo example "wey"**: by the docs' own method, `"wey"` vs `"whey"` shares 2 of 7
   trigrams (`  w`, `ey `), about **0.29**, under both the `%` default (0.3) and the `<%` default
   (0.6). "hardcor" is fine (below). Expect "wey" to miss at default thresholds. **Inferred** from
   the trigram rules quoted in Q4; confirm in the Q45 real-Postgres suite.

## Q1: the index declaration

**Verified API** (`node_modules/drizzle-orm/pg-core/indexes.d.ts:55`):
`using(method: PgIndexMethod, ...columns: [Partial<ExtraConfigColumn | SQL>, ...])`. A raw `sql`
expression is accepted; `PgIndexMethod` includes `'gin'` (`indexes.d.ts:35`).

How drizzle-kit 0.31.10 renders each element (**verified**, `bin.cjs:25024` and `:25037`):
```
${isExpression ? expression : `"${expression}"`}${opclass ? ` ${opclass}` : asc ? "" : " DESC"}...
CREATE INDEX "name" ON "table" USING ${method} (${value}) [WITH ...] [WHERE ...];
```
Column references inside an index `sql` render **unqualified** (`"name"`, not `"foods"."name"`):
`drizzle-orm/sql/sql.js:120-121` (`invokeSource === "indexes"`). The repo's own
`foods_user_barcode_key` proves it: `coalesce("user_id", '')` in
`0001_amused_stark_industries.sql:132`. **Verified.**

| Declaration | drizzle-kit output | Status |
|---|---|---|
| `.using("gin", table.name.op("gin_trgm_ops"))` | `USING gin ("name" gin_trgm_ops)` | verified (code); no unaccent, so not what we want |
| `.using("gin", sql\`nutrisa_unaccent(lower(${table.name})) gin_trgm_ops\`)` | `USING gin (nutrisa_unaccent(lower("name")) gin_trgm_ops)` | verified (code) |
| same without `gin_trgm_ops` | `USING gin (nutrisa_unaccent(lower("name")))` | output verified; Postgres then rejects it (GIN has no default opclass for `text`): **unverified** |

The second form is valid Postgres: the synopsis is `{ column_name | ( expression ) } [ COLLATE ] [ opclass ]`,
and "the parentheses can be omitted if the expression has the form of a function call"
(https://www.postgresql.org/docs/17/sql-createindex.html). **Verified.**

Snapshot safety: drizzle-kit squashes an index to one string split on `;`, `,,` and `--`
(`bin.cjs:6428-6432`, `:6436-6447`). The expression above contains none of them. Keep it that
way, which is one more reason to put the dictionary literal inside the wrapper, not the index.
**Verified (code); the consequence is inferred.**

**Recommended declaration**, added to the `foods` extra-config array after `check("foods_one_basis", ...)`:
```ts
/**
 * Trigram search over the accent-folded, lower-cased name. The opclass sits
 * inside the sql template because Drizzle's .op() only exists on plain columns.
 * nutrisa_unaccent() is created by migration 0005, not by drizzle-kit.
 */
index("foods_name_trgm_idx").using(
  "gin",
  sql`nutrisa_unaccent(lower(${table.name})) gin_trgm_ops`,
),
```
Do **not** add `.concurrently()`: the migrator runs every pending migration inside one
transaction (`drizzle-orm/pg-core/dialect.js:59-66`), and `CREATE INDEX CONCURRENTLY` "cannot" run
in a transaction block (sql-createindex.html above). **Verified.**

Queries must use the **same expression** for the planner to use the index, e.g.
``sql`${q} <% nutrisa_unaccent(lower(${foods.name}))` ``. **Inferred** (standard expression-index
matching; `docs/17/indexes-expressional.html` not re-read in this pass).

## Q2: extensions, functions, and migration order

- drizzle-kit 0.31.10 never emits `CREATE EXTENSION` or `CREATE FUNCTION`: neither string occurs in
  `bin.cjs`; its only extension handling is `extensionsFilters`, typed `literalType("postgis")`
  (`bin.cjs:10860`), used to filter introspection/push. **Verified.** So `generate` neither creates
  nor later drops them. **Inferred** (it diffs snapshots only).
- `--custom` is a real flag: `custom: boolean().desc("Prepare empty migration file for custom SQL")`
  (`bin.cjs:91964`), with `--name` (`:91962`). **Verified.**
- What `--custom` writes (**verified**): a snapshot that is a **copy of the previous snapshot** with new
  `id`/`prevId` (`preparePgMigrationSnapshot`, `bin.cjs:19854-19858`; used at `:32183-32194`), a journal
  entry, and a SQL file containing only `-- Custom SQL migration file, put your code below! --`
  (`bin.cjs:32945-32948`). Because the snapshot ignores schema.ts, the **next** plain `generate` still
  sees the new index as a change and emits it. Editing schema.ts before or after the custom step
  makes no difference.
- Docs page: https://orm.drizzle.team/docs/kit-custom-migrations shows
  `drizzle-kit generate --custom --name=seed-users`. **Verified** (unversioned page; matches the code).
- Statement splitting: the migrator splits a file **only** on `--> statement-breakpoint`
  (`drizzle-orm/migrator.js:16`) and runs each chunk with `tx.execute(sql.raw(stmt))`
  (`dialect.js:63-64`). It does not split on `;`, so a `$$ ... $$` body is safe. **Verified.**
  Put a breakpoint between every statement, as generated files do (`BREAKPOINT`, `bin.cjs:32901`):
  whether one chunk may hold several statements depends on the driver, and drizzle-kit `migrate`
  here uses `@neondatabase/serverless` over a websocket `Pool` (`bin.cjs:79067-79101`). Multi-statement
  chunk behaviour: **unverified**, so do not rely on it.
- The migrator applies a migration only if its journal `when` is newer than the last applied row
  (`dialect.js:61`); the stored hash is never compared. **Verified.** So never edit an applied
  migration: the edit would silently never run.

**Order:** custom migration first (extensions + function), normal `generate` second (index).
Single-file alternative: `generate` the index, then prepend the extension/function statements to that
SQL before it is ever applied. It works (the migrator only runs the file; the snapshot is
unaffected), but a hand-edited generated file is easier to miss in review. Prefer two files.

## Q3: unaccent is STABLE; the IMMUTABLE wrapper

- Both `unaccent(regdictionary, text)` and `unaccent(text)` are declared `LANGUAGE C STABLE STRICT
  PARALLEL SAFE` (https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/contrib/unaccent/unaccent--1.1.sql).
  **Verified.** The docs page itself does not state volatility.
- "All functions and operators used in an index definition must be immutable" (sql-createindex.html). **Verified.**
- One-arg form uses "the text search dictionary named `unaccent` and appearing in the same schema as
  the `unaccent()` function itself" (https://www.postgresql.org/docs/17/unaccent.html). **Verified.**
- "While `CREATE INDEX` is running, the search_path is temporarily changed to `pg_catalog, pg_temp`"
  (sql-createindex.html). **Verified.** Hence: a string-body SQL function, "parsed at execution time"
  (https://www.postgresql.org/docs/17/sql-createfunction.html, **verified**), must schema-qualify
  both the function and the dictionary or the index build cannot find them. **Inferred.**
- Alternative: the SQL-standard `RETURN` body "is parsed at function definition time" and "tracks
  dependencies" (same page, **verified**), so it resolves names once, at `CREATE FUNCTION` time.
  Qualify anyway; it costs nothing.
- The IMMUTABLE-wrapper pattern itself is **not in the Postgres docs**. It is a widespread
  community idiom; provenance **unverified**. Its known trade-off (**inferred**): it promises
  immutability for something that depends on the dictionary's rules file; if those rules ever
  changed, the index would need a `REINDEX`.

## Q4: pg_trgm (https://www.postgresql.org/docs/17/pgtrgm.html, all **verified** unless marked)

- `similarity(a,b)`; `word_similarity(a,b)`: greatest similarity between a's trigram set and "any
  continuous extent of an ordered set of trigrams" in b; `strict_word_similarity`: extents snap to
  word boundaries.
- `%` uses `pg_trgm.similarity_threshold` (**0.3**); `<%` / commutator `%>` use
  `pg_trgm.word_similarity_threshold` (**0.6**); `<<%` / `%>>` use
  `pg_trgm.strict_word_similarity_threshold` (**0.5**). Distance operators `<->`, `<<->`, `<<<->`
  are efficient with GiST, "but not by GIN indexes".
- GIN `gin_trgm_ops` supports the similarity operators plus `LIKE`, `ILIKE`, `~`, `~*`, `=`;
  "the search string need not be left-anchored", so both `ILIKE '%foo%'` and `ILIKE 'foo%'` qualify.
  "A pattern with no extractable trigrams will degenerate to a full-index scan."
- Trigram extraction ignores non-alphanumerics; each word gets two leading spaces and one trailing.
  Comparisons are case-insensitive in a default build (so `lower()` is belt-and-braces for `%`,
  but needed for a plain `LIKE`).
- Worked example in the docs: `word_similarity('word','two words')` = **0.8** (4 shared trigrams of 5).
- **Inferred** from that method: `word_similarity('hardcor', 'usn hardcore whey')`: "hardcor" has 8
  trigrams (`  h`, ` ha`, `har`, `ard`, `rdc`, `dco`, `cor`, `or `); the extent `  h`…`cor` of
  "hardcore" matches 7, so about **0.875**, above 0.6, so `'hardcor' <% ...` matches. `"wey"` vs
  `"whey"`: about 0.29, misses (see contradiction 3). Check both in Q45.
- Word-prefix matching (Q31) can stay index-backed: `expr ILIKE 'hard%' OR expr ILIKE '% hard%'`, or
  `expr ~ '\mhard'`; all are on the supported list. **Inferred.**

## Q5: Neon

https://neon.com/docs/extensions/pg-extensions lists `pg_trgm` 1.6 and `unaccent` 1.1 for PG14
through PG18, notes "None", and says "supported extensions can be installed using CREATE EXTENSION
syntax". **Verified.** The page does not say which role may run it. Both modules are "trusted",
installable by "non-superusers who have CREATE privilege on the current database" (pgtrgm.html,
unaccent.html, **verified**), so the database owner role can. **Inferred.**

## Recommended plan for this repo

1. `npx drizzle-kit generate --custom --name=search_extensions` produces
   `server/db/migrations/0005_search_extensions.sql` plus `meta/0005_snapshot.json` (a copy of 0004)
   and a journal entry. Replace the placeholder comment with:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
   CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
   CREATE OR REPLACE FUNCTION public.nutrisa_unaccent(text) RETURNS text
     LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
     AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
   ```
   (Assumes the extensions land in `public`, Neon's default schema: **inferred**.)
2. Add the `foods_name_trgm_idx` declaration (Q1) to `server/db/schema.ts`, then
   `npx drizzle-kit generate --name=foods_name_trgm`. Expected `0006_foods_name_trgm.sql`:
   `CREATE INDEX "foods_name_trgm_idx" ON "foods" USING gin (nutrisa_unaccent(lower("name")) gin_trgm_ops);`
3. `npm run db:migrate` against the dev branch **and** the Neon `test` branch (plan Q45). Sriman runs
   it. No POPIA cascade change: no new table.
4. If a `brand` column is added (contradiction 2), it is its own column migration plus a second
   expression index (or a combined `name || ' ' || coalesce(brand,'')` expression) in step 2's
   generate.
