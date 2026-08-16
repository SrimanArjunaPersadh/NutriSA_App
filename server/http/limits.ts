import { createHash, randomBytes } from "node:crypto"

import type { Context, MiddlewareHandler } from "hono"

import { getScope, type AppEnv } from "../auth/user-scope"

/**
 * Request volume: what is capped, and what is merely counted.
 *
 * plan.md, branch `api-writes`: "Rate-limit or at minimum log unauthenticated
 * request volume". Both halves are here, and they are deliberately different
 * shapes because the two problems are different.
 *
 * ## Writes are capped per verified user
 *
 * A write costs a row in Neon and a slot in the free tier's quota, and the only
 * caller that can reach one has already proved who it is. So the cap is per
 * Clerk id, and it is set far above anything a person does by hand — the ceiling
 * exists to stop a loop, not to pace a user. Somebody logging a big meal, a
 * weigh-in and a target change in the same minute is nowhere near it.
 *
 * ## Unauthenticated requests are counted, not blocked
 *
 * The 401 path is already cheap: no database, no Clerk network call beyond
 * token verification, no row. Blocking there would mean keying on IP, and the
 * volume is worth knowing long before it is worth acting on — this server has
 * had a public ngrok URL for a week and nobody has ever looked at how much
 * unauthenticated traffic reaches it.
 *
 * **No IP address is stored or printed.** An IP is personal information under
 * POPIA, and the question here is "how much, from how many" — which a truncated
 * hash under a random per-process salt answers exactly as well. See
 * `CALLER_SALT` below for what that does and does not guarantee; the short
 * version is that nothing holding the logs can turn a key back into an address,
 * and the keys stop meaning anything at a restart.
 *
 * ## In-memory, and therefore per-instance
 *
 * Both counters live in this process. On today's single dev server behind ngrok
 * that is the whole picture. On Vercel it is not: each serverless instance gets
 * its own copy, so the effective cap becomes the limit times however many
 * instances are warm, and the counts undercount by the same factor. That is a
 * real limitation and it is the reason a proper limiter needs shared state
 * (Upstash or Neon itself) — which is a Phase 12 concern, not a reason to ship
 * nothing now. Whatever replaces this should keep the interface below.
 */

/** The write cap: per verified user, per window. */
const WRITE_WINDOW_MS = 60_000
const WRITES_PER_WINDOW = 60

/** How often the unauthenticated count is summarised to the log. */
const UNAUTH_WINDOW_MS = 5 * 60_000

/**
 * Fixed windows, not a sliding log.
 *
 * A sliding window means keeping every timestamp per key, which is unbounded
 * memory for an unbounded number of keys — the shape that turns a rate limiter
 * into the outage. A fixed window can let through up to twice the limit across
 * a boundary, and at 60 writes a minute that is a rounding error next to what
 * it is protecting.
 */
type Window = { startedAt: number; count: number }

const writeWindows = new Map<string, Window>()

/**
 * Windows are dropped when they expire, and the map is swept when it grows.
 *
 * Without this, one entry per user id accumulates forever — and user ids are
 * attacker-supplied in the sense that anyone who can sign up can add one.
 */
const MAX_TRACKED_KEYS = 10_000

function hit(windows: Map<string, Window>, key: string, windowMs: number, now: number): number {
  const existing = windows.get(key)
  if (!existing || now - existing.startedAt >= windowMs) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      for (const [candidate, window] of windows) {
        if (now - window.startedAt >= windowMs) windows.delete(candidate)
      }
    }
    windows.set(key, { startedAt: now, count: 1 })
    return 1
  }

  existing.count += 1
  return existing.count
}

/**
 * Caps writes per verified user.
 *
 * Mounted **after** `requireUser`, so there is always a scope: an
 * unauthenticated caller never reaches this and is counted by the other half of
 * this module instead.
 *
 * A refused request answers `429` with the shared `rate-limited` code and a
 * `Retry-After` in seconds, which is what a client backing off should read
 * rather than guessing.
 */
export const writeRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const now = Date.now()
  const { userId } = getScope(c)
  const count = hit(writeWindows, userId, WRITE_WINDOW_MS, now)

  if (count > WRITES_PER_WINDOW) {
    /**
     * The millisecond arithmetic here and in `recordUnauthenticated` is
     * deliberately **not** engine work, and the distinction is worth naming
     * because the standing rule is written broadly.
     *
     * `packages/engine/` owns the numbers a user reads as their data — a macro
     * total, a trend weight, a streak, a position in a day. These two are
     * transport bookkeeping: seconds until a window rolls, for an HTTP header
     * defined by RFC 9110, and a rounded minute count for a log line. Neither
     * appears on a screen, neither is derived from anything anyone logged, and
     * moving them into the engine would put HTTP semantics inside a package
     * whose entire value is that it knows nothing about HTTP.
     */
    const window = writeWindows.get(userId)
    const elapsed = window ? now - window.startedAt : 0
    const retryAfter = Math.max(1, Math.ceil((WRITE_WINDOW_MS - elapsed) / 1000))

    // The user id, never the body: the request being refused is a meal or a
    // weigh-in, and none of that belongs in a log line.
    console.warn(`Rate limit hit by ${userId} on ${c.req.method} ${c.req.path}`)

    return c.json(
      {
        code: "rate-limited" as const,
        message: "Too many writes. Try again shortly.",
      },
      429,
      { "Retry-After": String(retryAfter) },
    )
  }

  await next()
  return undefined
}

/**
 * 256 bits of real entropy, per process, never logged and never persisted.
 *
 * ## Why not `pid` and a timestamp
 *
 * That was the first version, and it did not earn the claim above it. IPv4 is
 * only 2³² addresses and a salt of `process.pid + Date.now()` is nearly free to
 * guess — the pid comes from a small range and the process start time is
 * effectively published in the "API listening on…" boot line a second later. So
 * anyone holding the logs could brute-force the salt, then the whole address
 * space, and walk a key back to a real IP. A hash whose input space is
 * enumerable is an encoding, not a protection.
 *
 * `randomBytes` closes that: without the salt, and it is never written
 * anywhere, the mapping cannot be inverted at all.
 *
 * ## What this is, precisely
 *
 * Pseudonymisation within one window, not anonymisation — and that is exactly
 * what counting *distinct* callers requires. Two requests from one address must
 * land on the same key or the count is meaningless. What the design guarantees
 * is narrower and worth stating exactly: no IP is written to a log, a response
 * or disk; the key cannot be reversed by anyone holding the logs; and it stops
 * meaning anything at all the moment the process restarts.
 */
const CALLER_SALT = randomBytes(32)

function callerKey(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
  const address = forwarded || c.req.header("cf-connecting-ip") || "unknown"
  return createHash("sha256").update(CALLER_SALT).update(address).digest("hex").slice(0, 8)
}

let unauthWindow = { startedAt: Date.now(), total: 0, callers: new Set<string>() }

/**
 * Counts one refused request and, at the end of a window, says how many there
 * were.
 *
 * Summarised on the next event rather than on a timer. A `setInterval` would
 * hold the event loop open — a server that will not exit because a counter is
 * still waiting to report zero — and it would fire in tests that never made a
 * request. The cost is that a quiet spell after a burst delays the line until
 * the next one; the count is not lost, and nobody is watching this in real time
 * anyway.
 *
 * Called from `requireUser`, which is the only place a request is refused for
 * want of a valid token.
 */
export function recordUnauthenticated(c: Context): void {
  const now = Date.now()

  if (now - unauthWindow.startedAt >= UNAUTH_WINDOW_MS && unauthWindow.total > 0) {
    const minutes = Math.round((now - unauthWindow.startedAt) / 60_000)
    console.warn(
      `Unauthenticated requests: ${unauthWindow.total} from ${unauthWindow.callers.size} ` +
        `caller(s) in the last ~${minutes}m`,
    )
    unauthWindow = { startedAt: now, total: 0, callers: new Set() }
  }

  unauthWindow.total += 1
  if (unauthWindow.callers.size < MAX_TRACKED_KEYS) {
    unauthWindow.callers.add(callerKey(c))
  }
}

/** The current window's tally. For tests and for a future `/health` field. */
export function unauthenticatedVolume(): { total: number; callers: number } {
  return { total: unauthWindow.total, callers: unauthWindow.callers.size }
}
