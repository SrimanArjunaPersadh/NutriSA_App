/**
 * The colour palette, as values.
 *
 * NativeWind `className` is the styling rule and stays the rule — but a
 * className cannot reach every place a colour is needed. Three contexts take a
 * value and nothing else:
 *
 * - `contentStyle` on an expo-router `Stack` (a style object, not a class)
 * - `NativeTabs` colour props — `backgroundColor`, `tintColor`, `iconColor`
 * - `react-native-svg` `fill` / `stroke` / `color` props
 *
 * Those import from here. **A hex literal anywhere else under `src/` is
 * forbidden** and `tests/no-hex-literals.test.ts` fails the build on one, with
 * `src/components/icons/BrandIcons.tsx` the single allowlisted file — Google's
 * and Apple's marks are third-party brand assets and must not be tokenised.
 *
 * This module and `tailwind.config.js` are two hand-maintained copies of one
 * palette, because a `.js` Tailwind config cannot require a `.ts` module.
 * `tests/tokens.test.ts` asserts they agree in both directions, so a colour
 * added to one and forgotten in the other is a failing test rather than a
 * mismatch someone spots on device six weeks later.
 *
 * The canonical table lives in `plan.md` under "Design tokens (fixed)". The
 * neutrals below it were in the code as bare hexes before they were in any
 * table; they are promoted here, not invented.
 */

export const colors = {
  // ── plan.md's fixed table ────────────────────────────────────────────────
  /** App ground. */
  ground: "#131211",
  /** Card surfaces. */
  card: "#1C1B19",
  /** Nested surfaces inside a card. */
  secondary: "#262422",
  /** Primary actions, and the trend line. */
  primary: "#D08A5A",
  /** Inline text links. Was a brighter blue than `primary`; since the
   *  Graphite & Copper palette (2026-10-20) it is the same copper, which reads
   *  well inside a sentence on the warm charcoal. Kept as its own token so the
   *  two can part again without touching every link. */
  link: "#D08A5A",
  /** Loss / success. */
  ok: "#9DB89A",
  /** Gain / over target. */
  danger: "#E5614C",
  /** Warnings, and the dashed projection — a guess is never stated in the same
   *  colour as a fact. */
  amber: "#E3A44A",
  /** Macro — protein. */
  protein: "#4C8DFF",
  /** Macro — carbs. */
  carbs: "#FFC21A",
  /** Macro — fats. */
  fats: "#F0468F",

  // ── Neutrals, promoted from bare literals ────────────────────────────────
  /**
   * Primary text, selected chips and the slider's thumb: a **warm off-white**
   * since the Graphite & Copper palette (2026-10-20), not pure white. Tailwind's
   * own `white` is shadowed with this value, so `text-white` and `bg-white` are
   * this colour too. Where true white is required (the Apple and Google sign-in
   * buttons, a packshot's background) use `pureWhite`.
   *
   * It is registered rather than left to Tailwind because `react-native-svg`
   * takes a value, and an icon that has to match the text needs one to read.
   */
  white: "#F3EFE9",
  /** Secondary text: captions, axis labels, units. The most-used unregistered
   *  colour in the app before this module existed. */
  textSecondary: "#A19A91",
  /** Raw scale readings on the chart. Deliberately dimmer than
   *  `textSecondary` — a raw daily weight is never presented as progress. */
  dotMuted: "#7A736B",
  /** The tab bar's top hairline. */
  hairline: "#2B2926",
  /** Card border. `card` and `ground` are five points apart in luminance, so
   *  without this the cards vanish on an OLED panel. */
  cardBorder: "#262422",
  /** Border on secondary buttons sitting on a card. */
  buttonBorder: "#36332F",
  /** The unfilled remainder of a progress ring. */
  ringTrack: "#34312D",

  /**
   * True white, for surfaces that must not take the warm `white` text colour:
   * the Apple and Google sign-in buttons (both brands' guidelines ask for
   * white) and the band behind a product photo, since packshots are shot on
   * white. Added with the Graphite & Copper palette, 2026-10-20.
   */
  pureWhite: "#FFFFFF",

  // ── Screen-specific ──────────────────────────────────────────────────────
  /**
   * Base of the sign-in screen's scrim.
   *
   * Two points darker than `ground` and **not** a mistake: it is sampled from
   * `src/design/auth_ui_design.png`, where the photo is dimmed to slightly
   * below the app ground so the wordmark reads at the top of the ramp. Kept as
   * its own token rather than folded into `ground` because the difference is
   * ~1 ΔL*, right at the threshold, and that call belongs to a device check
   * rather than to a refactor. See the note in the branch report.
   */
  authGradientBase: "#0E0D0C",
} as const

export type ColorToken = keyof typeof colors

/**
 * `rgba()` string from a token and an alpha.
 *
 * `LinearGradient` needs per-stop opacity, and the alternative — an eight-digit
 * `#RRGGBBAA` — is exactly the hex literal this module exists to remove.
 */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
