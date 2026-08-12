import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg"

import { Card, CardLabel } from "@/components/dashboard/Card"
import { ChevronDown } from "@/components/icons/UiIcons"
import { weightTrend, type ChartPoint } from "@/components/dashboard/design-fixture"
import { colors } from "@/design/tokens"

const PAD_LEFT = 30 // gutter for the kg labels
const PAD_RIGHT = 10
const PAD_TOP = 8
const PLOT_HEIGHT = 150
const X_LABEL_BASELINE = PAD_TOP + PLOT_HEIGHT + 22
const CHART_HEIGHT = X_LABEL_BASELINE + 8

// react-native-svg takes colour values, not classNames — see src/design/tokens.ts.
const AXIS = colors.textSecondary
const DOT = colors.dotMuted
const TREND = colors.primary
const PROJECTION = colors.amber
const GOAL = colors.ok
const AXIS_FONT = "Barlow_400Regular"

/**
 * Weight over the selected window: every scale reading as a dot, the smoothed
 * line through them, and where that rate lands if it holds.
 *
 * The projection is deliberately a different colour *and* dashed. Solid blue is
 * what happened; amber dashes are a guess, and the two must never be mistakeable
 * for each other at a glance.
 *
 * The chart needs a pixel width before it can place anything, so it renders
 * nothing until onLayout reports one. React Native gives that on the first
 * commit, so there is no visible blank frame.
 */
export function WeightTrendCard() {
  const [width, setWidth] = useState(0)

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <CardLabel>WEIGHT TREND</CardLabel>
        <RangePicker />
      </View>

      <View
        className="mt-[14px]"
        style={{ height: CHART_HEIGHT }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {width > 0 ? <TrendChart width={width} /> : null}
      </View>
    </Card>
  )
}

/**
 * The window selector. Unwired on this branch — the chart has one fixture
 * series, so cycling the label would lie about the data underneath it.
 */
function RangePicker() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Chart range: ${weightTrend.selectedRange}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className="h-[36px] flex-row items-center rounded-[9px] border border-buttonBorder bg-secondary px-[12px] active:opacity-80"
    >
      <Text className="font-barlow-medium text-[16px] text-white">
        {weightTrend.selectedRange}
      </Text>
      <View className="ml-[8px]">
        <ChevronDown size={16} color={AXIS} />
      </View>
    </Pressable>
  )
}

function TrendChart({ width }: { width: number }) {
  const { span, yDomain, xTicks, yTicks, goal, readings, trend, projection } = weightTrend

  const plotWidth = width - PAD_LEFT - PAD_RIGHT
  const kgRange = yDomain.max - yDomain.min

  const x = (day: number) => PAD_LEFT + (day / span) * plotWidth
  const y = (kg: number) => PAD_TOP + ((yDomain.max - kg) / kgRange) * PLOT_HEIGHT
  const path = (points: ChartPoint[]) =>
    points.map((point) => `${x(point.day)},${y(point.kg)}`).join(" ")

  const goalY = y(goal.kg)

  return (
    <Svg width={width} height={CHART_HEIGHT}>
      {yTicks.map((tick) => (
        <SvgText
          key={tick}
          x={PAD_LEFT - 8}
          y={y(tick) + 4}
          textAnchor="end"
          fontFamily={AXIS_FONT}
          fontSize={13}
          fill={AXIS}
        >
          {String(tick)}
        </SvgText>
      ))}

      {/* Goal sits under the series so a reading landing on it stays readable. */}
      <Line
        x1={PAD_LEFT}
        y1={goalY}
        x2={width - PAD_RIGHT}
        y2={goalY}
        stroke={GOAL}
        strokeWidth={1.5}
        strokeDasharray={[5, 4]}
      />
      <SvgText
        x={width - PAD_RIGHT}
        y={goalY - 9}
        textAnchor="end"
        fontFamily={AXIS_FONT}
        fontSize={13}
        fill={GOAL}
      >
        {goal.label}
      </SvgText>

      {readings.map((reading) => (
        <Circle key={reading.day} cx={x(reading.day)} cy={y(reading.kg)} r={2.2} fill={DOT} />
      ))}

      <Polyline
        points={path(trend)}
        fill="none"
        stroke={TREND}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline
        points={path(projection)}
        fill="none"
        stroke={PROJECTION}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={[7, 6]}
      />

      {xTicks.map((tick) => (
        <SvgText
          key={tick.day}
          x={x(tick.day)}
          y={X_LABEL_BASELINE}
          textAnchor="middle"
          fontFamily={AXIS_FONT}
          fontSize={13}
          fill={AXIS}
        >
          {tick.label}
        </SvgText>
      ))}
    </Svg>
  )
}
