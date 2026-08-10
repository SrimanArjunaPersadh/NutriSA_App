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

export const clerkUserCreated = eventType("clerk/user.created", {
  schema: z.object({ user: clerkUserSchema }),
});

/**
 * Dev-only client. With no INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY set, the SDK
 * talks to the local Inngest dev server on http://127.0.0.1:8288
 * (`npm run inngest:dev`). Production keys are deliberately out of scope.
 */
export const inngest = new Inngest({ id: "nutrisa" });
