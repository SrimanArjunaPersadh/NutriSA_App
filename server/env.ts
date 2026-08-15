import { config } from "dotenv";

// One env file at the project root — the only location Metro reads for
// EXPO_PUBLIC_* vars, so client and server share it.
config({ path: ".env" });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env (see .env.example).`);
  }
  return value;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  // verifyWebhook() reads CLERK_WEBHOOK_SIGNING_SECRET itself; asserted here so
  // a missing secret fails at boot rather than on the first delivery.
  CLERK_WEBHOOK_SIGNING_SECRET: required("CLERK_WEBHOOK_SIGNING_SECRET"),
  // Verifies every session token. Required at boot rather than on the first
  // protected request: a server that starts and then 401s everything looks
  // like an auth bug for as long as it takes someone to check .env.
  CLERK_SECRET_KEY: required("CLERK_SECRET_KEY"),
  /**
   * Optional. With no DSN, Sentry stays off and the server runs normally —
   * error reporting is not allowed to be a boot dependency, and there is no
   * reason to ship dev-loop stack traces to a project dashboard.
   */
  SENTRY_DSN: process.env.SENTRY_DSN ?? "",
  /** Tags events so a local run is never mistaken for the real thing. */
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT ?? "development",
  PORT: Number(process.env.PORT ?? 3000),
};
