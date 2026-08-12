import { View } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { colors } from "@/design/tokens"

/**
 * The donut used by both the "of the way" ring and the four macro rings.
 *
 * The arc starts at 12 o'clock and fills clockwise. SVG's own zero angle is at
 * 3 o'clock, so the whole <Svg> is rotated a quarter turn rather than the
 * progress <Circle> — the track underneath is a full circle, so rotating the
 * pair together is invisible and avoids react-native-svg's per-element
 * `origin` prop, which behaves differently across platforms.
 */
type ProgressRingProps = {
  /** Outer diameter, in points. */
  size: number
  strokeWidth: number
  /** 0–1. Values outside that range are clamped rather than wrapped. */
  progress: number
  color: string
  trackColor?: string
  /** Centred content — laid out over the ring, not inside its bounds. */
  children?: React.ReactNode
}

export function ProgressRing({
  size,
  strokeWidth,
  progress,
  color,
  trackColor = colors.ringTrack,
  children,
}: ProgressRingProps) {
  const centre = size / 2
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const filled = Math.max(0, Math.min(1, progress))

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={circumference * (1 - filled)}
          fill="none"
        />
      </Svg>
      {children}
    </View>
  )
}
