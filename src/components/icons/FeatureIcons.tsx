import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg"

/**
 * The three value-prop icons under the auth buttons. Geometry is traced from
 * src/design/auth_ui_design.png; colours are sampled from the same file. These
 * are decorative, so they deliberately do not reuse the reserved macro tokens.
 *
 * The reference draws each icon with a coloured bloom around it. That is done
 * here by stroking the same shapes twice — a wide translucent pass under a
 * crisp one — rather than with a View shadow, which iOS cannot cast from a
 * transparent SVG and which web renders as a rectangle.
 */

export const FEATURE_PURPLE = "#B07CF6"
export const FEATURE_TEAL = "#5FE3C6"
export const FEATURE_AMBER = "#F9B81A"

const STROKE = 1.7
const BLOOM = 5
const BLOOM_OPACITY = 0.22

type IconProps = { size?: number; color?: string }

/**
 * Renders an SVG icon with a translucent bloom effect and a crisp foreground stroke.
 *
 * @param shapes - Function that produces the icon shapes for a given stroke width
 */
function Bloomed({
  size,
  color,
  shapes,
}: {
  size: number
  color: string
  shapes: (strokeWidth: number) => React.ReactNode
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} opacity={BLOOM_OPACITY}>
        {shapes(BLOOM)}
      </G>
      <G stroke={color}>{shapes(STROKE)}</G>
    </Svg>
  )
}

/**
 * Renders a crosshair icon with a ringed center.
 *
 * @param size - The icon size in pixels
 * @param color - The icon stroke color
 */
export function TargetIcon({ size = 22, color = FEATURE_PURPLE }: IconProps) {
  return (
    <Bloomed
      size={size}
      color={color}
      shapes={(w) => (
        <>
          <Circle cx={12} cy={12} r={9} strokeWidth={w} />
          <Circle cx={12} cy={12} r={2.8} strokeWidth={w} />
          <Line x1={12} y1={0.6} x2={12} y2={6.6} strokeWidth={w} strokeLinecap="round" />
          <Line x1={12} y1={17.4} x2={12} y2={23.4} strokeWidth={w} strokeLinecap="round" />
          <Line x1={0.6} y1={12} x2={6.6} y2={12} strokeWidth={w} strokeLinecap="round" />
          <Line x1={17.4} y1={12} x2={23.4} y2={12} strokeWidth={w} strokeLinecap="round" />
        </>
      )}
    />
  )
}

/** "See what matters" — three outlined bars, short / tall / medium. */
export function BarsIcon({ size = 22, color = FEATURE_TEAL }: IconProps) {
  return (
    <Bloomed
      size={size}
      color={color}
      shapes={(w) => (
        <>
          <Rect x={1.1} y={13.5} width={6} height={9.5} rx={1.8} strokeWidth={w} />
          <Rect x={9} y={1} width={6} height={22} rx={1.8} strokeWidth={w} />
          <Rect x={16.9} y={6.5} width={6} height={16.5} rx={1.8} strokeWidth={w} />
        </>
      )}
    />
  )
}

/**
 * Renders an amber monitor icon with an idea symbol, stand, and base line.
 *
 * @returns The rendered insight icon.
 */
export function InsightIcon({ size = 22, color = FEATURE_AMBER }: IconProps) {
  return (
    <Bloomed
      size={size}
      color={color}
      shapes={(w) => (
        <>
          <Rect x={0.9} y={0.9} width={22.2} height={15.6} rx={3.2} strokeWidth={w} />
          <Path
            d="M8.6 7.4a3.4 3.4 0 0 1 6.8 0c0 1.4-.9 2.1-1.3 2.9h-4.2c-.4-.8-1.3-1.5-1.3-2.9Z"
            strokeWidth={w}
            strokeLinejoin="round"
          />
          <Path d="M9.4 16.5 8.9 21h6.2l-.5-4.5" strokeWidth={w} strokeLinejoin="round" />
          <Line x1={3.8} y1={22.2} x2={20.2} y2={22.2} strokeWidth={w} strokeLinecap="round" />
        </>
      )}
    />
  )
}
