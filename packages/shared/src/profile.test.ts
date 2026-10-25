import { describe, expect, it } from "vitest"

import { writeProfileSchema } from "./profile"

/**
 * The profile write contract. Each case is a body that would do something
 * specific and wrong if it were accepted — see `./writes.test.ts` for the same
 * framing on the other writes.
 */

describe("writeProfileSchema", () => {
  const at = (goalWeightKg: unknown) => writeProfileSchema.safeParse({ goalWeightKg })

  it("accepts a goal weight between 30 and 300 kg", () => {
    expect(at(30).success).toBe(true)
    expect(at(82.5).success).toBe(true)
    expect(at(300).success).toBe(true)
  })

  it("refuses a goal outside the bounds", () => {
    expect(at(29.9).success).toBe(false)
    expect(at(300.1).success).toBe(false)
    expect(at(0).success).toBe(false)
  })

  /**
   * 82.3 is the case that breaks a naive check: `82.3 * 10` is
   * 822.9999999999999 in floating point.
   */
  it("accepts one decimal place, and refuses two", () => {
    expect(at(82.3).success).toBe(true)
    expect(at(82.35).success).toBe(false)
  })

  it("accepts null, which clears the goal", () => {
    expect(at(null).success).toBe(true)
  })

  it("refuses an empty body rather than treating it as a successful no-op", () => {
    expect(writeProfileSchema.safeParse({}).success).toBe(false)
  })

  /**
   * POPIA minimality, enforced by the contract: the fields no feature reads are
   * not just missing from the form, they cannot get through the schema.
   */
  it("drops every profile field it does not own", () => {
    const parsed = writeProfileSchema.parse({ goalWeightKg: 80, heightCm: 180, age: 30, sex: "m" })
    expect(parsed).toEqual({ goalWeightKg: 80 })
  })
})
