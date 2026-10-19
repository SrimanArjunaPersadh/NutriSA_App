import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * The SDK pin, enforced.
 *
 * AGENTS.md says the SDK moves only when the Expo Go app on the iPhone reports a new
 * number. That rule has now been tested in both directions.
 *
 * It was violated once, expensively: an upgrade to SDK 57 typechecked clean, passed
 * `expo-doctor` 20/20, and then failed on the device with "Project is incompatible with
 * this version of Expo Go" and had to be fully reverted. Expo Go was on 54 at the time.
 * This test was written in the aftermath.
 *
 * It was then satisfied, on 2026-09-09: Expo Go on the iPhone reported **SDK 57**, Metro
 * refused the 54 project against it, and the pin moved 54 → 57 with react-native 0.81.5 →
 * 0.86.3. The same evidence that made the first attempt wrong made the second one right.
 * The rule never changed; only the number the device reported did.
 *
 * Neither the typechecker nor expo-doctor can catch a pin violation, because nothing is
 * wrong with the code — the constraint lives in the App Store, not in the repo. So it
 * lives here instead. A rule in an instructions file gets violated by the next person in
 * a hurry; a rule with a failing test does not.
 *
 * To move the SDK: confirm the new number in Expo Go on the device first, then change
 * PINNED_SDK here in the same commit as the upgrade. The test is a speed bump with a
 * reason attached, not a lock.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = JSON.parse(readFileSync(join(HERE, "..", "package.json"), "utf8"))

const PINNED_SDK = 57
const PINNED_RN = "0.86.3"

describe("Expo SDK pin", () => {
  it(`pins expo to SDK ${PINNED_SDK}`, () => {
    const range: string = PKG.dependencies.expo
    const major = Number(range.replace(/^[^\d]*/, "").split(".")[0])

    expect(
      major,
      `package.json depends on expo ${range}, which is SDK ${major}, not the pinned ` +
        `SDK ${PINNED_SDK}. Expo Go from the App Store supports exactly one SDK at a ` +
        `time. Confirm the number Expo Go reports on the device before changing this.`,
    ).toBe(PINNED_SDK)
  })

  it(`pins react-native to ${PINNED_RN}`, () => {
    expect(
      PKG.dependencies["react-native"],
      "react-native moves with the SDK, never on its own.",
    ).toBe(PINNED_RN)
  })

  it("keeps AGENTS.md agreeing with package.json about the SDK number", () => {
    const agents = readFileSync(join(HERE, "..", "AGENTS.md"), "utf8")

    expect(
      agents.includes(`SDK **${PINNED_SDK}**`) || agents.includes(`SDK ${PINNED_SDK}`),
      `AGENTS.md no longer states SDK ${PINNED_SDK}. The instructions file and the ` +
        `manifest must agree — an agent that reads a stale number writes stale code.`,
    ).toBe(true)
  })
})
