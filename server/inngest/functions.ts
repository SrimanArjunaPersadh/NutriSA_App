import { db, schema } from "../db";
import { clerkUserCreated, inngest } from "./client";

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
    const user = event.data.user;

    const email =
      user.email_addresses.find((e) => e.id === user.primary_email_address_id)
        ?.email_address ??
      user.email_addresses[0]?.email_address ??
      null;

    await step.run("upsert-user", async () => {
      await db
        .insert(schema.users)
        .values({
          clerkId: user.id,
          email,
          firstName: user.first_name ?? null,
          lastName: user.last_name ?? null,
          imageUrl: user.image_url ?? null,
        })
        .onConflictDoUpdate({
          target: schema.users.clerkId,
          set: {
            email,
            firstName: user.first_name ?? null,
            lastName: user.last_name ?? null,
            imageUrl: user.image_url ?? null,
            updatedAt: new Date(),
          },
        });
    });

    // Never log the email — only the opaque Clerk id.
    return { clerkId: user.id };
  },
);

export const functions = [syncClerkUserCreated];
