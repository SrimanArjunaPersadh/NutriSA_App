import { eq } from "drizzle-orm";

import { db, schema } from "../db";
import {
  clerkUserCreated,
  clerkUserDeleted,
  clerkUserUpdated,
  inngest,
} from "./client";
import type { clerkUserSchema } from "./client";
import type { z } from "zod";

type ClerkUser = z.infer<typeof clerkUserSchema>;

/**
 * Clerk keeps the primary address in a separate id field, and the array is not
 * ordered — the first entry is not reliably the primary one. Falls back to the
 * first address, then to null: the sample payloads Clerk sends from the
 * dashboard's Testing tab carry no addresses at all.
 */
function primaryEmail(user: ClerkUser): string | null {
  return (
    user.email_addresses.find((e) => e.id === user.primary_email_address_id)
      ?.email_address ??
    user.email_addresses[0]?.email_address ??
    null
  );
}

/**
 * Shared by `user.created` and `user.updated`. Clerk sends the complete user on
 * both, so there is one write, not an insert plus a separate update path that
 * could drift out of step with it.
 */
async function upsertUser(user: ClerkUser) {
  const values = {
    email: primaryEmail(user),
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    imageUrl: user.image_url ?? null,
  };

  await db
    .insert(schema.users)
    .values({ clerkId: user.id, ...values })
    .onConflictDoUpdate({
      target: schema.users.clerkId,
      set: { ...values, updatedAt: new Date() },
    });
}

/**
 * Writes a newly signed-up Clerk user into Neon.
 *
 * Runs out of band because webhook delivery is at-least-once and eventually
 * consistent: Svix retries, Inngest retries, and Clerk can replay from the
 * dashboard. The upsert makes every one of those paths land on the same row.
 */
export const syncClerkUserCreated = inngest.createFunction(
  {
    id: "sync-clerk-user-created",
    retries: 3,
    triggers: [{ event: clerkUserCreated }],
  },
  async ({ event, step }) => {
    await step.run("upsert-user", () => upsertUser(event.data.user));
    // Never log the email — only the opaque Clerk id.
    return { clerkId: event.data.user.id };
  },
);

/**
 * Mirrors a profile change (name, avatar, primary email) back into Neon.
 *
 * Upserts rather than updates on purpose: an update that arrives for a user we
 * never stored — the row was cleared in dev, or the `user.created` delivery
 * failed while this one succeeded — would otherwise silently write nothing.
 */
export const syncClerkUserUpdated = inngest.createFunction(
  {
    id: "sync-clerk-user-updated",
    retries: 3,
    triggers: [{ event: clerkUserUpdated }],
  },
  async ({ event, step }) => {
    await step.run("upsert-user", () => upsertUser(event.data.user));
    return { clerkId: event.data.user.id };
  },
);

/**
 * POPIA deletion cascade. Clerk is the identity authority, so a user removed
 * there must leave nothing behind here.
 *
 * `users` is currently the only user-scoped table, which makes this one delete
 * the whole cascade. **Every new user-scoped table must be removed here in the
 * same branch that adds it** (AGENTS.md) — either by a foreign key with
 * `onDelete: 'cascade'` pointing at `users.clerk_id`, or by an explicit delete
 * added to this function. A table that escapes the cascade is a silent legal
 * hole, not a tidy-up for later.
 *
 * Deleting a row that isn't there is a no-op rather than an error, so a
 * replayed or duplicated delete is safe.
 */
export const syncClerkUserDeleted = inngest.createFunction(
  {
    id: "sync-clerk-user-deleted",
    retries: 3,
    triggers: [{ event: clerkUserDeleted }],
  },
  async ({ event, step }) => {
    const { id } = event.data.user;

    const deleted = await step.run("delete-user", async () => {
      const rows = await db
        .delete(schema.users)
        .where(eq(schema.users.clerkId, id))
        .returning({ clerkId: schema.users.clerkId });
      return rows.length;
    });

    // `deleted: 0` is normal for a replay; it is only worth noticing if a first
    // delivery finds nothing, which would mean the mirror was already out of step.
    return { clerkId: id, deleted };
  },
);

export const functions = [
  syncClerkUserCreated,
  syncClerkUserUpdated,
  syncClerkUserDeleted,
];
