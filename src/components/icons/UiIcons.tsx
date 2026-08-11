import Svg, { Path } from "react-native-svg"

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
  color = "#22C55E",
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
export function ChevronDown({ size = 16, color = "#8A8F98" }: IconProps) {
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
