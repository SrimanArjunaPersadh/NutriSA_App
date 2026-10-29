import { Inngest, eventType } from "inngest";
import { z } from "zod";

/**
 * The slice of Clerk's `user.created` payload this app actually stores.
 * Unknown keys are ignored, so Clerk adding fields never breaks a delivery.
 */
export const clerkUserSchema = z.object({
  id: z.string(),
  email_addresses: z.array(
    z.object({ id: z.string(), email_address: z.string() }),
  ),
  primary_email_address_id: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
});

/**
 * What leaves this server for Inngest Cloud: the slice above, **parsed**, so
 * every other key Clerk sends (phone numbers, linked accounts, metadata,
 * sign-in times) is dropped here.
 *
 * The event schemas below do not do this. In inngest 4.18.0, `create()` keeps
 * the raw `data` and `send()` only checks it against the schema, then throws
 * the parsed copy away (`components/triggers/triggers.js`). Sending
 * `evt.data` as it arrives would store the whole Clerk user in Inngest's event
 * history, a third party the POPIA deletion cascade cannot reach. Privacy axis
 * of `/nutrisa-review`, 2026-10-29.
 */
export function clerkUserForSync(data: unknown): z.infer<typeof clerkUserSchema> {
  return clerkUserSchema.parse(data);
}

export const clerkUserCreated = eventType("clerk/user.created", {
  schema: z.object({ user: clerkUserSchema }),
});

/**
 * Same payload as `user.created` — Clerk sends the whole user on every update,
 * not a diff — so both events land on the same upsert.
 */
export const clerkUserUpdated = eventType("clerk/user.updated", {
  schema: z.object({ user: clerkUserSchema }),
});

/**
 * `user.deleted` carries a deleted-object stub, not a user: an id and a
 * `deleted` flag, nothing else. The id is all the cascade needs.
 */
export const clerkUserDeleted = eventType("clerk/user.deleted", {
  schema: z.object({ user: z.object({ id: z.string() }) }),
});

/**
 * The mode comes from the environment, not from here. inngest v4 defaults to
 * **cloud**: locally, `INNGEST_DEV=http://127.0.0.1:8288` in `.env` points it at
 * the dev server (`npm run inngest:dev`); on Vercel, `INNGEST_DEV` is unset and
 * `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` carry it to Inngest Cloud.
 * Without the event key, `inngest.send()` in the Clerk webhook throws.
 */
export const inngest = new Inngest({ id: "nutrisa" });
