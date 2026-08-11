import { serve as honoServe } from "@hono/node-server";
import { Hono } from "hono";
import { serve as inngestServe } from "inngest/hono";
import { verifyWebhook } from "@clerk/backend/webhooks";

import { env } from "./env";
import {
  clerkUserCreated,
  clerkUserDeleted,
  clerkUserUpdated,
  inngest,
} from "./inngest/client";
import { functions } from "./inngest/functions";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

// Landing route. Without this, clicking the URL in the boot log 404s, which
// reads as "the server is broken" when it is actually fine.
app.get("/", (c) =>
  c.json({
    service: "nutrisa-api",
    routes: ["GET /health", "POST /api/webhooks/clerk", "GET|POST|PUT /api/inngest"],
  }),
);

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

  // Svix's message id dedupes redeliveries of the same event.
  const opts = { id: c.req.header("svix-id") };

  switch (evt.type) {
    case "user.created":
      await inngest.send(clerkUserCreated.create({ user: evt.data }, opts));
      break;

    case "user.updated":
      await inngest.send(clerkUserUpdated.create({ user: evt.data }, opts));
      break;

    case "user.deleted":
      // The deleted-object stub types `id` as optional. Without one there is
      // nothing to delete, so drop it rather than fail the delivery and have
      // Clerk retry a payload that can never succeed.
      if (evt.data.id) {
        await inngest.send(
          clerkUserDeleted.create({ user: { id: evt.data.id } }, opts),
        );
      } else {
        console.warn("Clerk user.deleted arrived with no id; ignoring");
      }
      break;

    // Any other subscribed event is verified and acknowledged, never acted on.
  }

  return c.text("OK", 200);
});

const inngestHandler = inngestServe({ client: inngest, functions });
app.on(["GET", "POST", "PUT"], "/api/inngest", (c) => inngestHandler(c));

honoServe({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
  console.log(`  Health check    http://localhost:${info.port}/health`);
  console.log(`  Clerk webhook  POST /api/webhooks/clerk`);
  console.log(`  Inngest         ALL /api/inngest`);
});
