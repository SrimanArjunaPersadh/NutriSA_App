import type { z } from "zod"

import { apiErrorSchema, type ApiErrorCode } from "@shared"

/**
 * The typed API client.
 *
 * One function reaches the network — `request` below. Everything else in the
 * app goes through the query hooks in `queries.ts`, which go through this.
 *
 * ## Every response is parsed, not cast
 *
 * `await res.json() as DaySummary` is a lie the compiler agrees with: it types
 * a value nobody checked, and the first time the server drops a field the app
 * renders `undefined` somewhere deep in a card with no error anywhere. So the
 * body goes through the shared zod schema instead, which is the same
 * declaration the server shapes its response with — one source of truth per
 * contract, per AGENTS.md, validated at the boundary where the two meet.
 *
 * A parse failure is an `ApiError` like any other. It means client and server
 * disagree about the contract, which is a bug, and the surface shows its error
 * state rather than rendering half a screen.
 */

/**
 * Where the API lives.
 *
 * `EXPO_PUBLIC_` because Metro only inlines that prefix into the bundle. In
 * development this is the **ngrok URL**, not `localhost`: the app runs on a
 * physical iPhone, and localhost there is the phone itself.
 *
 * Read at module load and checked once, so a missing value is one clear error
 * at startup rather than an identical fetch failure inside every card.
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? ""

/**
 * Announced once, at bundle load, so the Metro console answers "did the address
 * make it into the app" without anyone having to add a temporary log.
 *
 * This is the fastest way to tell a Metro cache problem from a real network
 * one: the value here is inlined at **build** time, so if it prints empty, no
 * amount of restarting ngrok will help — Metro has to be restarted with
 * `--clear`. The URL is not a secret; the token that travels to it is, and that
 * is never logged.
 */
console.log(
  BASE_URL
    ? `[api] base URL: ${BASE_URL}`
    : "[api] base URL is EMPTY — EXPO_PUBLIC_API_URL did not reach the bundle. Add it to .env and restart Metro with: npm start -- --clear",
)

/**
 * Failure codes the **client** can raise, on top of the ones the server sends.
 *
 * `no-api-url` is deliberately its own code rather than folded into `network`.
 * They were the same code at first, and it cost an evening: a missing
 * `EXPO_PUBLIC_API_URL` and a genuine unreachable server both rendered "Can't
 * reach the server", which sends you to check the tunnel, the firewall and the
 * phone's Wi-Fi — none of which is the problem. The two have nothing in common
 * except that no request happened, and they are fixed in completely different
 * places.
 */
type ClientErrorCode = "network" | "malformed-response" | "no-api-url"

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | ClientErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

/** True when the failure is one signing in again would fix. */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "unauthenticated"
}

/**
 * A GET against the API, authenticated and parsed.
 *
 * `getToken` is passed in rather than imported. This module has no React in it
 * and Clerk's token lives behind a hook, so the caller — a query hook, which is
 * already inside a component — supplies it. That also keeps this function
 * testable without a Clerk provider.
 *
 * A null token is an `unauthenticated` failure raised **before** the request.
 * Sending an unauthenticated call to a route that will certainly refuse it just
 * turns one clear local state into a round-trip and a 401.
 */
export async function apiGet<T extends z.ZodType>(
  path: string,
  schema: T,
  getToken: () => Promise<string | null>,
): Promise<z.infer<T>> {
  if (!BASE_URL) {
    throw new ApiError(
      "no-api-url",
      "EXPO_PUBLIC_API_URL is not set. Add the ngrok URL to .env at the project root and restart Metro — it is inlined at build time, so a running bundle will not pick it up.",
    )
  }

  const token = await getToken()
  if (!token) {
    throw new ApiError("unauthenticated", "Not signed in.")
  }

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        /**
         * ngrok's free tier serves an HTML interstitial — "You are about to
         * visit…" — to anything it takes for a browser, and React Native's
         * fetch sends a user agent it sometimes takes for one. The response is
         * then a 200 full of HTML, so the request *succeeds* and the zod parse
         * is what fails, with an error that says nothing about tunnels.
         *
         * Any value for this header skips it. Harmless once the API is on
         * Vercel — an unknown header is ignored — so it stays rather than
         * becoming a dev-only branch.
         */
        "ngrok-skip-browser-warning": "true",
      },
    })
  } catch (cause) {
    // No response at all: the tunnel is down, the phone is offline, or the dev
    // server is not running. Distinct from an error the server sent, because
    // the fix is completely different and the error state says so.
    throw new ApiError(
      "network",
      cause instanceof Error ? cause.message : "Could not reach the server.",
    )
  }

  if (!response.ok) {
    throw new ApiError(await errorCode(response), await errorMessage(response), response.status)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError("malformed-response", "The server sent something that is not JSON.")
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    // Logged in full because this one is always a bug in this repo — the two
    // sides import the same schema, so a mismatch means one of them shipped
    // without the other. The user still only sees the error state.
    console.error(`Response from ${path} did not match its schema:`, parsed.error.issues)
    throw new ApiError("malformed-response", "The server sent an unexpected response.")
  }

  return parsed.data
}

/**
 * The server's own error code, when it sent one.
 *
 * The body is read once and reused by both helpers below via this cache: a
 * `Response` body is a stream and can only be consumed once, so reading it in
 * two places would throw on the second.
 */
const errorBodies = new WeakMap<Response, { code?: string; message?: string }>()

async function readErrorBody(response: Response) {
  const cached = errorBodies.get(response)
  if (cached) return cached

  let parsed: { code?: string; message?: string } = {}
  try {
    const body = await response.json()
    const result = apiErrorSchema.safeParse(body)
    if (result.success) parsed = result.data
  } catch {
    // A non-JSON error body is ordinary — Hono's own 404 is plain text.
  }
  errorBodies.set(response, parsed)
  return parsed
}

async function errorCode(response: Response): Promise<ApiErrorCode | "network"> {
  const body = await readErrorBody(response)
  if (body.code) return body.code as ApiErrorCode
  // Fall back to the status when the body says nothing useful, so a bare 401
  // from anywhere still routes to the sign-in path.
  if (response.status === 401) return "unauthenticated"
  if (response.status === 400) return "bad-request"
  if (response.status === 404) return "not-found"
  return "server-error"
}

async function errorMessage(response: Response): Promise<string> {
  const body = await readErrorBody(response)
  return body.message ?? `Request failed with status ${response.status}.`
}
