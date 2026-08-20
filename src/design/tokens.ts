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
  ground: "#0D0F14",
  /** Card surfaces. */
  card: "#13161E",
  /** Nested surfaces inside a card. */
  secondary: "#1A1E29",
  /** Primary actions, and the trend line. */
  primary: "#0066FF",
  /** Inline text links — brighter than `primary`, which is too dark inside a
   *  sentence. A deliberate addition to the table, recorded in plan.md. */
  link: "#1A7CFC",
  /** Loss / success. */
  ok: "#22C55E",
  /** Gain / over target. */
  danger: "#FF3B30",
  /** Warnings, and the dashed projection — a guess is never stated in the same
   *  colour as a fact. */
  amber: "#F59E0B",
  /** Macro — protein. */
  protein: "#A78BFA",
  /** Macro — carbs. */
  carbs: "#FCD34D",
  /** Macro — fats. */
  fats: "#2DD4BF",

  // ── Neutrals, promoted from bare literals ────────────────────────────────
  /**
   * Primary text, and the only near-full-brightness surface in the app.
   *
   * Tailwind has always had `white`, so `text-white` and `bg-white` worked
   * without this — but `react-native-svg` takes a value, and an icon that has to
   * go white had nowhere to read it from. Registered rather than typed as a hex
   * at the one call site, because `no-hex-literals.test.ts` forbids that and is
   * right to: the second call site is how a palette starts drifting.
   *
   * `tailwind.config.js` now declares it too. That shadows Tailwind's built-in
   * `white` with the identical value, which changes nothing and keeps
   * `tokens.test.ts`'s both-directions check honest.
   */
  white: "#FFFFFF",
  /** Secondary text: captions, axis labels, units. The most-used unregistered
   *  colour in the app before this module existed. */
  textSecondary: "#8A8F98",
  /** Raw scale readings on the chart. Deliberately dimmer than
   *  `textSecondary` — a raw daily weight is never presented as progress. */
  dotMuted: "#6E7686",
  /** The tab bar's top hairline. */
  hairline: "#1E222B",
  /** Card border. `card` and `ground` are five points apart in luminance, so
   *  without this the cards vanish on an OLED panel. */
  cardBorder: "#20242D",
  /** Border on secondary buttons sitting on a card. */
  buttonBorder: "#2A2F3B",
  /** The unfilled remainder of a progress ring. */
  ringTrack: "#252A35",

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
  authGradientBase: "#090B10",
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
