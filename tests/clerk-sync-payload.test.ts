import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { clerkUserForSync } from "../server/inngest/client"

/**
 * What a Clerk user event carries to Inngest Cloud: the stored slice, and
 * nothing else.
 *
 * inngest's event schemas only check a payload; they do not strip it. So the
 * webhook parses the Clerk user itself before `inngest.send()`, and these tests
 * hold both halves: the parse drops unknown keys, and the webhook uses it.
 * Privacy axis of `/nutrisa-review`, 2026-10-29.
 */

const clerkUser = {
  id: "user_test",
  email_addresses: [
    {
      id: "idn_1",
      email_address: "someone@example.com",
      verification: { status: "verified", strategy: "from_oauth_google" },
      linked_to: [{ id: "idn_2", type: "oauth_google" }],
    },
  ],
  primary_email_address_id: "idn_1",
  first_name: "Test",
  last_name: "User",
  image_url: "https://img.clerk.com/x",
  phone_numbers: [{ phone_number: "+27820000000" }],
  external_accounts: [{ provider: "oauth_google", email_address: "someone@example.com" }],
  private_metadata: { note: "never leaves" },
  last_sign_in_at: 1793278560227,
}

describe("clerkUserForSync", () => {
  it("keeps exactly the fields the users table is written from", () => {
    expect(clerkUserForSync(clerkUser)).toEqual({
      id: "user_test",
      email_addresses: [{ id: "idn_1", email_address: "someone@example.com" }],
      primary_email_address_id: "idn_1",
      first_name: "Test",
      last_name: "User",
      image_url: "https://img.clerk.com/x",
    })
  })

  it("refuses a payload with no id, as the event schema would", () => {
    expect(() => clerkUserForSync({ email_addresses: [] })).toThrow()
  })
})

describe("the Clerk webhook", () => {
  const app = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "server", "app.ts"),
    "utf8",
  )

  it("never sends the raw Clerk payload to Inngest", () => {
    expect(app).not.toMatch(/user:\s*evt\.data\s*[},]/)
  })

  it("sends the parsed slice on both user.created and user.updated", () => {
    expect(app.match(/user:\s*clerkUserForSync\(evt\.data\)/g)).toHaveLength(2)
  })
})
