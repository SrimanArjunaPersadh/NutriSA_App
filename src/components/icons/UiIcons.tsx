import Svg, { Circle, G, Path } from "react-native-svg"

import { colors } from "@/design/tokens"

/**
 * Small chrome icons. Drawn rather than typed as "↓" / "⌄" because Barlow's
 * arrow coverage is not guaranteed and a missing glyph falls back to the system
 * face mid-sentence — which shows up as a stray tofu box on device long after
 * it looked fine on web.
 */

type IconProps = { size?: number; color?: string }

/** Direction-of-travel arrow next to the weekly weight delta. */
export function TrendArrow({
  size = 16,
  color = colors.ok,
  direction = "down",
}: IconProps & { direction?: "down" | "up" }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={direction === "up" ? { transform: [{ rotate: "180deg" }] } : undefined}
    >
      <Path
        d="M8 2.6v10.8M3.4 9.2 8 13.8l4.6-4.6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Disclosure caret inside the chart's range picker. */
export function ChevronDown({ size = 16, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="m4 6 4 4 4-4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/**
 * Drill-in caret on an insight card.
 *
 * Distinct from `BrandIcons.ChevronRight`, which is the link-blue one that
 * follows a text link on the sign-in screen. This one is chrome: it sits at the
 * end of a row and inherits the muted text colour.
 */
export function ChevronRight({ size = 16, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="m6 4 4 4-4 4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Magnifier in the food search field. */
export function SearchIcon({ size = 20, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={1.9} />
      <Path
        d="m16.2 16.2 4.3 4.3"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/**
 * Barcode-scanner affordance at the trailing edge of the search field.
 *
 * Corner brackets rather than a literal barcode: the brackets read as "point
 * the camera", which is the action, where a bare set of bars reads as "here is
 * a barcode", which is not.
 */
export function BarcodeIcon({ size = 22, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M3 8.5V5.5A2.5 2.5 0 0 1 5.5 3h3" />
        <Path d="M15.5 3h3A2.5 2.5 0 0 1 21 5.5v3" />
        <Path d="M21 15.5v3a2.5 2.5 0 0 1-2.5 2.5h-3" />
        <Path d="M8.5 21h-3A2.5 2.5 0 0 1 3 18.5v-3" />
      </G>
      <G stroke={color} strokeWidth={1.6} strokeLinecap="round">
        <Path d="M7.6 8.4v7.2" />
        <Path d="M11 8.4v7.2" />
        <Path d="M14.4 8.4v7.2" />
        <Path d="M17 8.4v7.2" />
      </G>
    </Svg>
  )
}

/**
 * The streak flame.
 *
 * ## The shape was chosen by rendering it, not by eye
 *
 * The first attempt was a symmetric teardrop and read unmistakably as a **water
 * drop**. What separates the two is not roundness, it is the tip: a drop tapers
 * to a straight point, a flame hooks over and leaves a concave bite under the
 * hook. This path has that hook, plus the small inner lick that fills the bite.
 *
 * Four alternatives were rasterised at 96, 34 and 16px and compared against
 * this one. Two were rejected for reading as drops. The one that looked best
 * large — the same outline with a hollow core, the classic two-part fire — was
 * rejected because at 16px the core stops being a core and becomes a chip out
 * of the bottom edge, which reads as a rendering fault rather than as fire.
 *
 * The lesson worth keeping: **this icon is judged at 16px, not at 96px.** Any
 * future edit has to be checked at the small end, where nearly every detail
 * that helps at the large end actively hurts.
 *
 * ## Colour and state
 *
 * It takes a `color` like every other icon here rather than owning its two
 * states, because "lit" is not a property of a flame — it is a property of
 * whether the day has been logged, which is the caller's business. Unlit is
 * `textSecondary`, burning is `amber`.
 *
 * Not the 🔥 emoji, deliberately: an emoji cannot be tinted, so the unlit state
 * could only be faked with opacity, and iOS would draw Apple's artwork while
 * Android drew Google's — two different marks for the app's own streak symbol.
 */
export function FlameIcon({ size = 20, color = colors.amber }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.6 1.2c.5 2.9-.6 4.4-2 6-1.6 1.9-3 3.6-3 6.3a6.4 6.4 0 0 0 12.8 0c0-2.7-1.2-4.3-2.5-5.8-.6-.7-1-1.4-1.2-2.2-1 .9-1.5 2.1-1.4 3.6.1 1.1-.4 1.7-1.1 1.7-.8 0-1.3-.7-1.2-1.8.2-2.6.6-5.2-.4-7.8Z"
        fill={color}
      />
    </Svg>
  )
}

/** The AI assistant's four-pointed sparkle, with a smaller one trailing it. */
export function SparkleIcon({ size = 22, color = colors.primary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 2.6c.9 3.5 1.6 4.2 5.1 5.1-3.5.9-4.2 1.6-5.1 5.1-.9-3.5-1.6-4.2-5.1-5.1 3.5-.9 4.2-1.6 5.1-5.1Z"
        fill={color}
      />
      <Path
        d="M17.4 13.4c.5 2 .9 2.4 2.9 2.9-2 .5-2.4.9-2.9 2.9-.5-2-.9-2.4-2.9-2.9 2-.5 2.4-.9 2.9-2.9Z"
        fill={color}
      />
    </Svg>
  )
}
