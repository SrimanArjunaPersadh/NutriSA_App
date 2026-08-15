import { serve as honoServe } from "@hono/node-server";
import { Hono } from "hono";
import { serve as inngestServe } from "inngest/hono";
import { verifyWebhook } from "@clerk/backend/webhooks";

import type { AppEnv, UserScope } from "./auth/user-scope";
import { env } from "./env";
import { captureRouteError, initSentry } from "./observability/sentry";
import { reads } from "./routes/reads";
import {
  clerkUserCreated,
  clerkUserDeleted,
  clerkUserUpdated,
  inngest,
} from "./inngest/client";
import { functions } from "./inngest/functions";

/**
 * First statement in the module body, which is as early as this can run.
 *
 * It is deliberately **not** "before the other imports" — ESM hoists every
 * import above the first statement regardless of where the call is written, so
 * moving this line up between the imports would look earlier and change
 * nothing. Sentry's guidance about initialising first is about OpenTelemetry
 * auto-instrumentation patching modules as they load, which this server does
 * not use: `tracesSampleRate` is 0 and only `captureException` is wanted. If
 * tracing is ever turned on, this has to move to a separate entry module
 * preloaded with `node --import`, not merely higher up this file.
 */
initSentry();

/**
 * Typed with `AppEnv` so `onError` can reach the request's `UserScope`. Only
 * the routes behind `requireUser` ever have one — Hono's types say the variable
 * is always present, which is true of those routes and not of this app as a
 * whole, so the handler below treats it as optional on purpose.
 */
const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ ok: true }));

// Landing route. Without this, clicking the URL in the boot log 404s, which
// reads as "the server is broken" when it is actually fine.
app.get("/", (c) =>
  c.json({
    service: "nutrisa-api",
    routes: [
      "GET /health",
      "GET /api/day/:date",
      "GET /api/weight-logs",
      "POST /api/webhooks/clerk",
      "GET|POST|PUT /api/inngest",
    ],
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

/**
 * The dashboard's read routes, every one behind Clerk session verification.
 * Mounted under /api so the webhook and Inngest handlers keep their paths.
 */
app.route("/api", reads);

/**
 * Unhandled errors.
 *
 * The client is told nothing beyond "something broke". A Postgres error
 * message can quote the failing statement with its parameters interpolated,
 * and the parameters on this API are weights and macros — so the detail goes to
 * the log and to Sentry (which scrubs it again on the way out), and never into
 * a response body.
 *
 * The user id is read straight off the context rather than through `getScope`:
 * this handler also runs for requests that never reached the middleware, and it
 * must not throw a second time while reporting the first failure.
 */
app.onError((err, c) => {
  const scope: UserScope | undefined = c.get("scope");
  console.error(`Unhandled error on ${c.req.method} ${c.req.path}:`, err);
  captureRouteError(err, scope?.userId);
  return c.json(
    { code: "server-error" as const, message: "Something went wrong." },
    500,
  );
});

honoServe({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
  console.log(`  Health check    http://localhost:${info.port}/health`);
  console.log(`  Day summary     GET /api/day/:date  (or /api/day/today)`);
  console.log(`  Weight series   GET /api/weight-logs?days=30`);
  console.log(`  Clerk webhook  POST /api/webhooks/clerk`);
  console.log(`  Inngest         ALL /api/inngest`);
});
