import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Mirror of the Clerk user, kept in sync by the `clerk/user.created` Inngest
 * job. The Clerk id is the primary key because every other user-scoped table
 * stamps rows with that same id (plan.md, Phase 1) — there is no second
 * identity to translate between.
 *
 * POPIA: this table is user-scoped. Any new column here must also be covered
 * by the Phase 11 deletion cascade and the data export.
 */
export const users = pgTable("users", {
  clerkId: text("clerk_id").primaryKey(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * The POPIA deletion cascade, expressed in the schema rather than in code.
 *
 * Every user-scoped table below carries this reference. Deleting the `users`
 * row — which is all the Inngest `user.deleted` job does — takes the rest with
 * it, in one transaction, at the only layer that cannot be bypassed. A new
 * table that uses this helper is in the cascade by construction; one that
 * invents its own `user_id` column is a silent legal hole, which is the failure
 * plan.md's standing rule is written against.
 *
 * `foods` is the deliberate exception: its user_id is nullable, so global rows
 * (`user_id IS NULL`) match no user and survive the delete. That is required —
 * the shared food database is not personal data and must outlive any one
 * account.
 */
const userId = () =>
  text("user_id")
    .notNull()
    .references(() => users.clerkId, { onDelete: "cascade" });

/**
 * The SAST calendar day a row belongs to, `YYYY-MM-DD`.
 *
 * Stored as a bare `date`, never a timestamp: the day is decided once by
 * `currentLoggingDay()` and written as a fact. A timestamptz would re-derive it
 * per reader's timezone and put the 00:40 case back in play everywhere.
 * `created_at` alongside it is always the real instant, so a back-dated entry
 * keeps both truths.
 */
const logDay = () => date("date").notNull();

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

/**
 * One weigh-in. `weight` is the raw scale reading in kg — never the trend,
 * which is derived by the engine and stored nowhere.
 */
export const weightLogs = pgTable(
  "weight_logs",
  {
    id: uuid("id").primaryKey(),
    userId: userId(),
    date: logDay(),
    weight: numeric("weight", { precision: 5, scale: 2, mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    /**
     * One weigh-in per day, enforced here because it is the only place that
     * can. The trend takes one step per row, so a duplicate day would double-
     * step the series and every value after it would be wrong — and wrong
     * quietly, since a trend that is off by a step still looks plausible.
     */
    uniqueIndex("weight_logs_user_date_key").on(table.userId, table.date),
  ],
);

// ---------------------------------------------------------------------------
// Food logging
// ---------------------------------------------------------------------------

/**
 * One line inside a logged meal, as stored in `items`.
 *
 * The abbreviated keys are the shape the old Supabase rows already use, kept
 * byte-identical so the migration is a straight JSON parse with no field
 * remapping — a remap is a chance to silently drop or transpose a macro across
 * 38 rows of history.
 *
 * `qty` is a **string, verbatim**. The old data holds things like "1 slice" and
 * "2.5"; parsing it would destroy what the user actually typed, and nothing
 * computes from it — the macros on the same object are authoritative.
 */
export type MealItem = {
  name: string;
  qty: string;
  kcal: number;
  pro: number;
  carb: number;
  fat: number;
};

/**
 * Header totals are **confirmed and authoritative**. They are never re-derived
 * from `items` at read time: the items are a record of what was entered, and a
 * later change to rounding or parsing must not retroactively move a total the
 * user already saw.
 */
const mealHeader = {
  name: text("name").notNull(),
  kcal: numeric("kcal", { precision: 9, scale: 2, mode: "number" }).notNull(),
  pro: numeric("pro", { precision: 8, scale: 2, mode: "number" }).notNull(),
  carb: numeric("carb", { precision: 8, scale: 2, mode: "number" }).notNull(),
  fat: numeric("fat", { precision: 8, scale: 2, mode: "number" }).notNull(),
  items: jsonb("items").$type<MealItem[]>().notNull(),
};

export const mealLogs = pgTable(
  "meal_logs",
  {
    id: uuid("id").primaryKey(),
    userId: userId(),
    date: logDay(),
    ...mealHeader,
    /** Wall-clock time the user attached to the meal, e.g. "08:15". Display only. */
    loggedTime: text("logged_time"),
    /** Position within the day. The day view orders by this, not by created_at. */
    sortOrder: integer("sort_order").notNull().default(0),
    /** The `custom_meals` row this was logged from, if any. */
    libId: text("lib_id"),
    createdAt: createdAt(),
  },
  (table) => [
    // The day view's only query shape: everything for one user on one day.
    index("meal_logs_user_date_idx").on(table.userId, table.date),
  ],
);

/** A saved meal in the library. Same header and item shape as a logged meal. */
export const customMeals = pgTable("custom_meals", {
  id: uuid("id").primaryKey(),
  userId: userId(),
  ...mealHeader,
  category: text("category"),
  /**
   * The user's own free-text note on the saved meal.
   *
   * Added after reading the export: all four Supabase `custom_meals` rows carry
   * one, and the first draft of this table had nowhere to put it — the
   * migration would have parsed the row, written every other field, and dropped
   * this one without erroring.
   */
  note: text("note"),
  createdAt: createdAt(),
});

export const foodSource = pgEnum("food_source", ["off", "label_scan", "manual", "seed"]);

/** Macros per 100g/ml, or per one unit. Same shape either way. */
export type FoodMacros = {
  kcal: number;
  pro: number;
  carb: number;
  fat: number;
};

/**
 * The food database — the user's own rows and the shared global ones together.
 *
 * `user_id` is nullable and that is the whole design: a row resolved from Open
 * Food Facts is cached once with `user_id IS NULL` and serves every user
 * forever. Those rows are not personal data, survive account deletion, and are
 * the start of the SA food-database moat.
 */
export const foods = pgTable(
  "foods",
  {
    id: uuid("id").primaryKey(),
    /** NULL means a global row shared by everyone. See the cascade note above. */
    userId: text("user_id").references(() => users.clerkId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cat: text("cat"),
    unit: text("unit"),
    defaultQty: numeric("default_qty", { precision: 8, scale: 2, mode: "number" }),
    per100: jsonb("per100").$type<FoodMacros>(),
    perUnit: jsonb("per_unit").$type<FoodMacros>(),
    unitLabel: text("unit_label"),
    barcode: text("barcode"),
    source: foodSource("source").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    /**
     * A barcode resolves to exactly one row per owner.
     *
     * Partial, because most rows have no barcode and NULL barcodes must not
     * collide with each other.
     *
     * `coalesce(user_id, '')` is doing the work that plan.md writes as
     * `NULLS NOT DISTINCT`. Postgres treats every NULL as distinct from every
     * other NULL in a unique index, so a plain `(user_id, barcode)` index would
     * let the same barcode be cached globally any number of times — and "never
     * re-fetch a barcode already resolved" would quietly stop holding.
     * `NULLS NOT DISTINCT` cannot be combined with a `WHERE` clause through
     * Drizzle's builder, and folding the NULLs to a sentinel is exactly
     * equivalent: the empty string is not a possible Clerk id, so it can only
     * ever mean "global".
     */
    uniqueIndex("foods_user_barcode_key")
      .on(sql`coalesce(${table.userId}, '')`, table.barcode)
      .where(sql`${table.barcode} IS NOT NULL`),
    /**
     * Exactly one of per100 / per_unit. A row with both is ambiguous about
     * which one the quantity multiplies, and a row with neither cannot produce
     * a macro at all — either way the engine would have to guess, and it must
     * never guess.
     */
    check(
      "foods_one_basis",
      sql`(${table.per100} IS NULL) <> (${table.perUnit} IS NULL)`,
    ),
  ],
);

/**
 * **Water tracking was cut from v1 on 2026-08-12.** Nothing reads or writes
 * this table, and the one row in the old Supabase data was deliberately not
 * migrated.
 *
 * The table is kept rather than dropped because an empty table costs nothing
 * and dropping one is destructive: re-adding the feature later would otherwise
 * need a fresh migration, whereas from here it is UI plus one route. It stays
 * in the deletion cascade so it cannot rot into a POPIA hole if it ever is used.
 */
export const waterLogs = pgTable(
  "water_logs",
  {
    id: uuid("id").primaryKey(),
    userId: userId(),
    date: logDay(),
    cups: integer("cups").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    // One running count per day — the UI increments this row, never appends.
    uniqueIndex("water_logs_user_date_key").on(table.userId, table.date),
  ],
);

// ---------------------------------------------------------------------------
// Targets and profile
// ---------------------------------------------------------------------------

/**
 * Effective-dated macro targets. A row states what the targets became on
 * `valid_from` and holds until a later row supersedes it.
 *
 * **There is deliberately no `valid_to`.** Two columns describing one boundary
 * can disagree, and the day they do, a stretch of history resolves to two
 * targets or to none. See `packages/engine/src/targets.ts`.
 */
export const targets = pgTable(
  "targets",
  {
    id: uuid("id").primaryKey(),
    userId: userId(),
    validFrom: date("valid_from").notNull(),
    kcal: numeric("kcal", { precision: 9, scale: 2, mode: "number" }).notNull(),
    pro: numeric("pro", { precision: 8, scale: 2, mode: "number" }).notNull(),
    carb: numeric("carb", { precision: 8, scale: 2, mode: "number" }).notNull(),
    fat: numeric("fat", { precision: 8, scale: 2, mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    // Two rows sharing a valid_from would make "the greatest valid_from at or
    // before this day" ambiguous, and the resolver would return whichever the
    // query happened to order last.
    uniqueIndex("targets_user_valid_from_key").on(table.userId, table.validFrom),
  ],
);

/**
 * Everything here is nullable on purpose. The profile is optional, filled in
 * over time, and no surface may require it — an empty profile is a valid state,
 * not an incomplete one.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  userId: userId().unique(),
  heightCm: numeric("height_cm", { precision: 5, scale: 1, mode: "number" }),
  age: integer("age"),
  sex: text("sex"),
  activity: text("activity"),
  /** Intended rate of change in kg per week. Signed; negative is a loss. */
  goalRate: numeric("goal_rate", { precision: 4, scale: 2, mode: "number" }),
  /**
   * The bodyweight being worked toward, in kg.
   *
   * Not in the original spec — found missing on 2026-08-12 while working out
   * what the dashboard actually needs. Three things on that screen depend on it
   * and none could be computed without it: "1.4 kg to goal", the "62% of the
   * way" ring, and the green goal line on the chart.
   *
   * Deliberately **not** effective-dated, unlike `targets`. A macro target
   * needs history because "what was I aiming for that day" changes how a past
   * day reads; a goal weight is a single destination, and moving it should move
   * the line on the whole chart rather than leave a step in it. If that turns
   * out to be wrong, this becomes its own effective-dated table — it does not
   * become a second column here.
   *
   * The starting weight is not stored: it is the first trend point, which the
   * engine already derives from `weight_logs`.
   */
  goalWeightKg: numeric("goal_weight_kg", { precision: 5, scale: 2, mode: "number" }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// AI chat and its ledger
// ---------------------------------------------------------------------------

/** Chat is health data: it goes in the POPIA export and the deletion cascade. */
export const chatConversations = pgTable("chat_conversations", {
  id: uuid("id").primaryKey(),
  userId: userId(),
  title: text("title"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatRole = pgEnum("chat_role", ["user", "assistant"]);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey(),
    /**
     * Denormalised from the conversation so the scoped query layer can filter
     * messages by user without a join. Both cascades fire on delete — via the
     * conversation and directly — which is redundant and meant to be: the
     * cascade is the one thing that must not depend on a join staying correct.
     */
    userId: userId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: chatRole("role").notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("chat_messages_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

/**
 * The AI spend ledger. The pre-flight budget gate sums this for the current
 * SAST month before every chat turn, so a row that fails to land is a turn that
 * was never paid for.
 *
 * `cost_usd` is stored, not computed at read time, and `rate_version` records
 * the table it was priced against — see `packages/engine/src/cost.ts`. Prices
 * change; a historical row must not silently re-value itself when they do.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey(),
    userId: userId(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    /** Which surface spent it: 'chat', 'ocr', 'weekly_report'. */
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }).notNull(),
    rateVersion: text("rate_version").notNull(),
  },
  (table) => [
    // The budget gate's only query: this user's spend across a time range.
    index("ai_usage_user_ts_idx").on(table.userId, table.ts),
  ],
);

export type WeightLog = typeof weightLogs.$inferSelect;
export type MealLog = typeof mealLogs.$inferSelect;
export type CustomMeal = typeof customMeals.$inferSelect;
export type Food = typeof foods.$inferSelect;
export type WaterLog = typeof waterLogs.$inferSelect;
export type Target = typeof targets.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;
