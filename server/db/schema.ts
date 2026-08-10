import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
