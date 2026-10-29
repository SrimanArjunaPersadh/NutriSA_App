import { serve } from "@hono/node-server";

import app from "./app";
import { env } from "./env";

/**
 * Local only: `npm run server`, behind ngrok. Vercel never runs this file; it
 * serves `app.ts`'s default export. The routes live there, and so does the
 * comment on why each router is mounted where it is.
 */
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
  console.log(`  Health check    http://localhost:${info.port}/health`);
  console.log(`  Day summary     GET /api/day/:date  (or /api/day/today)`);
  console.log(`  Weight series   GET /api/weight-logs?days=30`);
  console.log(`  Targets         GET /api/targets   POST /api/targets`);
  console.log(`  Goal weight     GET /api/profile   PUT /api/profile`);
  console.log(`  Log a meal     POST /api/meal-logs  DELETE /api/meal-logs/:id`);
  console.log(`  Log a weigh-in POST /api/weight-logs`);
  console.log(`  Read a label   POST /api/label-reads`);
  console.log(`  Chat           POST /api/chat/turns  GET /api/chat/conversations`);
  console.log(`  AI consent     GET  /api/ai/consent  PUT /api/ai/consent`);
  console.log(`  Clerk webhook  POST /api/webhooks/clerk`);
  console.log(`  Inngest         ALL /api/inngest`);
});
