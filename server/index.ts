import { serve as honoServe } from "@hono/node-server";
import { Hono } from "hono";
import { serve as inngestServe } from "inngest/hono";
import { verifyWebhook } from "@clerk/backend/webhooks";

import { env } from "./env";
import { clerkUserCreated, inngest } from "./inngest/client";
import { functions } from "./inngest/functions";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

/**
 * Clerk webhook receiver. Its only job is to verify the signature and enqueue —
 * the database write happens in the Inngest function so a slow or failing write
 * can never make Clerk's delivery time out.
 *
 * Public by design: authentication here is the Svix signature, not a session.
 */
app.post("/api/webhooks/clerk", async (c) => {
  let evt;
  try {
    evt = await verifyWebhook(c.req.raw);
  } catch (err) {
    console.error("Clerk webhook verification failed:", err);
    return c.text("Verification failed", 400);
  }

  if (evt.type === "user.created") {
    await inngest.send(
      clerkUserCreated.create(
        { user: evt.data },
        // Svix's message id dedupes redeliveries of the same event.
        { id: c.req.header("svix-id") },
      ),
    );
  }

  return c.text("OK", 200);
});

const inngestHandler = inngestServe({ client: inngest, functions });
app.on(["GET", "POST", "PUT"], "/api/inngest", (c) => inngestHandler(c));

honoServe({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
  console.log(`  Clerk webhook  POST /api/webhooks/clerk`);
  console.log(`  Inngest         ALL /api/inngest`);
});
