import { randomBytes } from "node:crypto"

/**
 * A UUIDv7 minted on the server, for the one id the server mints ahead of a
 * client write: the meal-log id on an assistant's meal card (plan.md, Phase 9,
 * Q10).
 *
 * The rule in `packages/shared/src/writes.ts` is that the server never mints an
 * id **at write time**, because a retried request would then write twice. A
 * card's id is minted once, when the card is made, and stored on it; the client
 * posts it to `POST /meal-logs` as its own, so a second Confirm lands on
 * `ON CONFLICT (id) DO NOTHING` like any retried write. It has to be a v7
 * because `clientIdSchema` checks the version nibble.
 *
 * The same layout as `src/lib/uuid.ts` and the security suite's minter: 48 bits
 * of milliseconds, version 7, the RFC variant, random elsewhere.
 */
export function uuidv7(): string {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(Date.now(), 0, 6)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join(
    "-",
  )
}
