import { config } from "dotenv";

// One env file at the project root — the only location Metro reads for
// EXPO_PUBLIC_* vars, so client and server share it.
config({ path: ".env" });

/**
 * Retrieves a required environment variable.
 *
 * @param name - The environment variable name
 * @returns The environment variable value
 * @throws If the environment variable is missing or empty
 */
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
  PORT: Number(process.env.PORT ?? 3000),
};
