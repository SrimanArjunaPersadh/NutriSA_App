import { getRandomBytes } from "expo-crypto"

/**
 * The client's UUIDv7 minter.
 *
 * Every row this app creates carries an id it minted itself. That is not a
 * convenience — it is the idempotency key the whole write API is built on. See
 * `packages/shared/src/writes.ts`: the server inserts `ON CONFLICT (id) DO
 * NOTHING`, so a save whose response was lost can be retried with the *same*
 * id and answered "already logged" instead of logging the meal twice. Only the
 * client knows whether a request is a retry or a new meal, so only the client
 * can mint the key.
 *
 * ## Why not `Crypto.randomUUID()`
 *
 * expo-crypto ships one, and it returns a **v4**. `clientIdSchema` is
 * `z.uuidv7()` and checks the version nibble, so a v4 is a 400 from every write
 * route. v7 is required rather than preferred: the values sort by creation
 * time, so they cluster in the primary-key index instead of scattering random
 * pages across it — which is what makes a batch flushed by the offline queue
 * (v1.1) an insert into one region of the index rather than all over it.
 *
 * ## Why not `node:crypto`
 *
 * It does not exist in React Native. `tests/security/write-isolation.test.ts`
 * mints ids the Node way and says so; this is the same twelve lines against the
 * one source of randomness the runtime actually has. `expo-crypto` is included
 * in the Expo Go binary, verified against the **SDK 54** docs — the SDK is
 * pinned and `latest` is not this project.
 *
 * `getRandomBytes` is the synchronous form on purpose. Minting an id is not
 * something a form submit should await, and the async variant exists for
 * platforms where entropy can block, which iOS and Android are not.
 */

/**
 * RFC 9562 layout: 48 bits of Unix milliseconds, 4 bits of version, 12 random,
 * 2 bits of variant, 62 random.
 *
 * The timestamp is the phone's clock, and that is fine — it is not a date. It
 * orders ids and nothing else, and no surface in this app reads a day out of an
 * id. Every **calendar** decision still comes from `currentLoggingDay()` on the
 * server, which is the single time authority; a phone whose clock is an hour
 * out mints an id that sorts an hour off and lands on exactly the right day.
 */
export function uuidv7(): string {
  const bytes = getRandomBytes(16)
  const millis = Date.now()

  // Big-endian 48-bit timestamp across bytes 0–5. Written by hand because
  // `writeUIntBE` is a Node Buffer method and this is a plain Uint8Array.
  // `Math.floor(millis / 2 ** 32)` is the high 16 bits: bitwise operators in JS
  // truncate to 32 bits, so `millis >>> 32` would be 0 and every id minted in
  // the same 49 days would share a prefix. This is not engine arithmetic — it
  // is byte packing, and it produces no number a user ever reads.
  bytes[0] = Math.floor(millis / 2 ** 40) & 0xff
  bytes[1] = Math.floor(millis / 2 ** 32) & 0xff
  bytes[2] = (millis >>> 24) & 0xff
  bytes[3] = (millis >>> 16) & 0xff
  bytes[4] = (millis >>> 8) & 0xff
  bytes[5] = millis & 0xff

  // Version 7 in the high nibble of byte 6, RFC 4122 variant in byte 8.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-")
}
