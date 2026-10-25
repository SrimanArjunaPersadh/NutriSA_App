import { ApiError } from "@/lib/api"

/**
 * What went wrong with a save, in the app's voice.
 *
 * Deliberately not `ErrorState`: that component fills its parent and offers a
 * retry button, which is right for a card that could not load and wrong for a
 * line above a button the user is about to press again anyway.
 *
 * ## The server's own message never reaches the screen
 *
 * Every string below is written here. The API's `message` is for whoever is
 * reading a log — it names a field and a shape — and it is written for a
 * developer. Printing it would put "macros.protein: Number must be greater than
 * or equal to 0" in front of somebody who typed a weight in wrong.
 *
 * ## Why this is shared and parameterised
 *
 * It started on the meal form and was about to be copied onto the weight one.
 * Three of the six cases have nothing to do with what is being saved — a 401,
 * a 409 and a 429 read the same either way — and a copy would have meant the
 * second surface quietly falling behind the first every time the wording moved.
 * The two words that genuinely differ are passed in.
 */
export type SaveWording = {
  /** What is being saved, as it appears mid-sentence: "meal", "weigh-in". */
  thing: string
  /** The sentence that follows a rejected body. Plural for a meal, singular for a weight. */
  check: string
}

export const MEAL_WORDING: SaveWording = {
  thing: "meal",
  check: "Check the numbers.",
}

export const WEIGHT_WORDING: SaveWording = {
  thing: "weigh-in",
  check: "Check the number.",
}

/** The one message for anything this cannot name. Never blames the user. */
const UNKNOWN = "Couldn't save that. This is a problem on our side, not yours."

/**
 * What went wrong with a **delete**, which is not a save.
 *
 * Separate because every sentence differs. A failed delete leaves the row
 * there, so "your weigh-in is still here, try again" — which is reassurance
 * after a failed save — is the opposite of what a failed delete needs to say.
 * And a 404 is not even a failure here: the row is gone, which is what was
 * asked for.
 *
 * The two were briefly one function, and the result printed "That weigh-in is
 * no longer there" above a Save button that would not retry the delete. Caught
 * by the Spec axis of `/nutrisa-review`, 2026-08-20.
 */
export function deleteErrorMessage(error: unknown, wording: SaveWording): string {
  if (!(error instanceof ApiError)) {
    return `Couldn't remove that ${wording.thing}. This is a problem on our side, not yours.`
  }

  switch (error.code) {
    case "network":
      return `Couldn't reach the server. The ${wording.thing} is still there.`
    case "unauthenticated":
      return "Your session expired. Sign in again to remove this."
    case "rate-limited":
      return "Too many changes at once. Give it a moment."
    default:
      return `Couldn't remove that ${wording.thing}. This is a problem on our side, not yours.`
  }
}

export function saveErrorMessage(error: unknown, wording: SaveWording): string {
  if (!(error instanceof ApiError)) return UNKNOWN

  switch (error.code) {
    case "network":
      return `Couldn't reach the server. Your ${wording.thing} is still here, try again.`
    case "unauthenticated":
      return "Your session expired. Sign in again to save this."
    case "conflict":
      return "Something clashed on our side. Tap save again."
    case "rate-limited":
      return "Too many saves at once. Give it a moment."
    case "bad-request":
      return `Something in this ${wording.thing} wasn't accepted. ${wording.check}`
    case "not-found":
      return `That ${wording.thing} is no longer there. It may have been deleted.`
    default:
      return UNKNOWN
  }
}
