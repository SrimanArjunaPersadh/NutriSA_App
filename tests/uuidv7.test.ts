import { describe, expect, it, vi } from "vitest"

/**
 * `expo-crypto` is a native module. Importing the real one under Node loads a
 * binding that is not there, so the randomness is stubbed — which is also the
 * only way to assert the byte layout at all, since real random bytes are not
 * assertable by definition.
 *
 * The stub returns `0xff` everywhere. That is deliberate: every bit the minter
 * is supposed to *overwrite* starts set, so a version or variant nibble it
 * forgets to write shows up as `f` in the output rather than as a plausible
 * hex digit.
 */
vi.mock("expo-crypto", () => ({
  getRandomBytes: (count: number) => new Uint8Array(count).fill(0xff),
}))

const { uuidv7 } = await import("../src/lib/uuid")

/**
 * The client's id minter, against the contract the server enforces.
 *
 * `clientIdSchema` is `z.uuidv7()` — it checks the version nibble — so a minter
 * that quietly produced a v4 would make **every write in the app** a 400, and
 * the first place anyone would notice is on the phone with no obvious cause.
 * The shape is twelve lines of byte packing, which is the kind of code that is
 * wrong only in the high bits and looks fine in every id you read by eye.
 *
 * Parsed here with the same schema the server uses, imported rather than
 * re-described — one source of truth per contract, checked from both ends.
 */
const { clientIdSchema } = await import("@shared")

describe("uuidv7", () => {
  it("mints an id the server's schema accepts", () => {
    expect(clientIdSchema.safeParse(uuidv7()).success).toBe(true)
  })

  it("is a canonical 8-4-4-4-12 string", () => {
    expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it("sets the version nibble to 7 and the variant to RFC 4122", () => {
    const id = uuidv7()
    // Version is the first character of the third group; variant is the first
    // of the fourth, and must land in 8-b.
    expect(id[14]).toBe("7")
    expect(["8", "9", "a", "b"]).toContain(id[19])
  })

  /**
   * The bug this file exists for. `millis >>> 32` is 0 in JavaScript — bitwise
   * operators truncate to 32 bits — so a minter written the obvious way puts
   * zeroes in the top two bytes and every id minted within the same ~49 days
   * shares a prefix, destroying the index locality v7 is chosen for.
   */
  it("writes the full 48-bit timestamp, high bytes included", () => {
    // 2026-08-19T00:00:00Z is well past the 2^32 ms mark (1970 + ~49 days), so
    // its top two bytes are non-zero for any correct implementation.
    const when = Date.UTC(2026, 7, 19)
    vi.spyOn(Date, "now").mockReturnValue(when)

    const hex = uuidv7().replace(/-/g, "")
    expect(hex.slice(0, 12)).toBe(when.toString(16).padStart(12, "0"))

    vi.restoreAllMocks()
  })

  it("orders by time, which is the whole reason for v7", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000_000_000)
    const earlier = uuidv7()
    vi.spyOn(Date, "now").mockReturnValue(1_000_000_001_000)
    const later = uuidv7()

    expect(earlier < later).toBe(true)
    vi.restoreAllMocks()
  })
})
