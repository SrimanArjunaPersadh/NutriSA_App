import { verifyToken } from "@clerk/backend"
import type { Context, MiddlewareHandler } from "hono"

import type { ApiErrorCode } from "@shared"

import { env } from "../env"

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

function fail(c: Context, code: ApiErrorCode, message: string, status: 401 | 400) {
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
