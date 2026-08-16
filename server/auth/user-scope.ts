import { verifyToken } from "@clerk/backend"
import type { Context, MiddlewareHandler } from "hono"

import type { ApiErrorCode } from "@shared"

import { env } from "../env"
import { recordUnauthenticated } from "../http/limits"

/**
 * The authorisation boundary. Everything user-scoped in this server is reached
 * through a `UserScope`, and a `UserScope` can only be made here.
 *
 * ## `user_id` is never accepted from the client
 *
 * plan.md's third standing rule. The id below comes from `sub` on a Clerk
 * session token this process verified against Clerk's JWKS — never from a body,
 * a param, a query string or a header the caller controls. That is the whole
 * design: not "we remember to check", but "there is no other way in".
 *
 * ## Why the brand symbol
 *
 * `UserScope` carries a property keyed by a symbol that is module-private. No
 * other file can name that key, so no other file can write down an object that
 * satisfies the type — not even by accident, and not with a cast that looks
 * innocent in review:
 *
 *     const scope = { userId: req.body.userId } as UserScope   // does not compile
 *
 * A plain `{ userId: string }` would have made every one of those a valid
 * scope, and the query layer would have been protected by nothing but everyone
 * downstream continuing to be careful. This is the difference between a rule
 * and a rule with teeth — the same reasoning behind `tests/engine-purity.test.ts`.
 */

const SCOPE_BRAND: unique symbol = Symbol("UserScope")

export type UserScope = {
  readonly [SCOPE_BRAND]: true
  /** The verified Clerk user id. The only id any query may filter on. */
  readonly userId: string
}

/** Private on purpose. Not exported, so the middleware below is the only maker. */
function createScope(userId: string): UserScope {
  return { [SCOPE_BRAND]: true, userId }
}

/** The Hono environment every protected route runs in. */
export type AppEnv = {
  Variables: {
    scope: UserScope
  }
}

/**
 * Refuses a request, and counts it.
 *
 * The tally is volume only — how many, from how many callers, never an IP and
 * never the token. plan.md's `api-writes` branch asks for exactly this, and
 * `../http/limits.ts` explains why the unauthenticated path is counted rather
 * than blocked.
 */
function fail(c: Context, code: ApiErrorCode, message: string, status: 401 | 400) {
  recordUnauthenticated(c)
  return c.json({ code, message }, status)
}

/**
 * Pulls the bearer token off the request.
 *
 * Header only — never a cookie and never a query string. This API is consumed
 * by a native app that holds its token in `expo-secure-store` and sends it
 * explicitly, so there is no browser form-post to protect and nothing for CSRF
 * to ride on. A token in a query string would also end up in access logs.
 */
function bearerToken(c: Context): string | null {
  const header = c.req.header("Authorization")
  if (!header) return null
  const [scheme, token] = header.split(" ")
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null
  return token.trim() || null
}

/**
 * Verifies the Clerk session token and puts a `UserScope` on the context.
 *
 * Uses `@clerk/backend`'s `verifyToken`, which is what this project's own
 * `.agents/skills/clerk-expo` reference prescribes for a plain backend:
 * "Clerk has no official Expo Router API-routes integration — treat any server
 * code as a normal backend and use `@clerk/backend`."
 *
 * Every failure path is a flat 401 with the same body. Distinguishing "expired"
 * from "malformed" from "signed by someone else" in the response would tell an
 * attacker which half of their guess was right, and the client's behaviour is
 * identical in all three cases: send the user back to the sign-in screen.
 * The reason is logged locally, where it is useful and not addressed to them.
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  /**
   * Already verified on this request. Nothing to do.
   *
   * Both routers mount this, and both are mounted at `/api` — so a write runs
   * the chain twice, because the first router's wildcard middleware matches
   * every path under the prefix and not only its own routes. Each router
   * declaring its own guard is worth keeping: `tests/security/` requests those
   * routers directly, and a router whose protection lives somewhere else is a
   * router that is one refactor away from having none.
   *
   * Trusting the scope already on the context is exactly as strong as verifying
   * the token again, and for a structural reason rather than a hopeful one:
   * `UserScope` carries a module-private symbol, so the only thing that can
   * have put one there is the code below.
   */
  if (c.get("scope")) {
    await next()
    return undefined
  }

  const token = bearerToken(c)
  if (!token) {
    return fail(c, "unauthenticated", "Authentication required.", 401)
  }

  let userId: string
  try {
    const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY })
    // `sub` is the Clerk user id and is always present on a session token. The
    // guard is here because the JWT payload type allows a string index, and a
    // token with no subject must be refused rather than scoped to "undefined".
    if (!payload.sub) {
      console.warn("Clerk token verified but carried no subject")
      return fail(c, "unauthenticated", "Authentication required.", 401)
    }
    userId = payload.sub
  } catch (err) {
    // Not sent to Sentry: a rejected token is an ordinary event on any public
    // endpoint, and reporting each one would bury real failures under expired
    // sessions. The token itself is never logged.
    console.warn("Clerk token rejected:", err instanceof Error ? err.message : err)
    return fail(c, "unauthenticated", "Authentication required.", 401)
  }

  c.set("scope", createScope(userId))
  await next()
  return undefined
}

/**
 * The scope for the current request.
 *
 * Throws rather than returning null if it is missing, which can only happen if
 * a route was mounted without `requireUser` in front of it. That is a wiring
 * mistake, and it must fail loudly at the first request in development rather
 * than fall through to a query that silently returns nobody's data — or, far
 * worse, everybody's.
 */
export function getScope(c: Context<AppEnv>): UserScope {
  const scope = c.get("scope")
  if (!scope) {
    throw new Error(
      "No UserScope on the request. This route is missing the requireUser middleware.",
    )
  }
  return scope
}
