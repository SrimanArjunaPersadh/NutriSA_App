import { useState } from "react"
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { currentLoggingDay, goalDirection, rateDirection, type LogDay } from "@engine"
import type { TrendChangeResponse, WeightEntry, WeightSeries } from "@shared"

import { Card, CardLabel } from "@/components/dashboard/Card"
import { TAB_BAR_CLEARANCE } from "@/components/dashboard/QuickActionBar"
import { ChevronRight } from "@/components/icons/UiIcons"
import { Empty, ErrorState, Loading } from "@/components/state"
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown"
import { DIRECTION_COLOR } from "@/components/weight/direction"
import { chartHeight, TrendChart } from "@/components/weight/TrendChart"
import { colors } from "@/design/tokens"
import { formatDayWithWeekday, formatKg, formatSignedKg } from "@/lib/format"
import { useWeightSeries } from "@/lib/queries"

/**
 * The Weight tab — plan.md, Phase 5: "a trend you can trust, and a raw weight
 * that never pretends to be progress".
 *
 * Top to bottom: the trend weight as the one large number on the screen, the
 * three engine-computed movements under it, the chart, the goal if there is
 * one, and the stored weigh-ins as a list you can tap into. A "Log weight"
 * button is pinned at the bottom, inside thumb reach.
 *
 * ## What is the hero, and what is deliberately not
 *
 * The 56pt number is the **trend**. Every raw scale reading on this screen is
 * secondary text at 15pt or smaller, in the history list, dated — a record of
 * what the scale said, not a statement about progress. That ordering is a
 * checklist item in its own right ("Raw daily weight is never presented as
 * progress — visually subordinate") because raw bodyweight swings a kilogram on
 * salt and water, and a screen that opens with today's reading is a screen that
 * congratulates and punishes people at random.
 *
 * The same rule decides the *colour*: a change is painted by whether it moved
 * **toward the goal**, decided by `goalDirection()` in the engine, not by the
 * sign. Green-for-down is wrong for anyone gaining toward a target, and with no
 * goal set there is no way to know which way is good — so the change is drawn
 * in plain secondary text, and the arrow still says which way it went.
 *
 * ## Every number here arrives computed
 *
 * The trend, both changes, the weekly rate, the goal remainder and the
 * projected date are all fields on `GET /weight-logs`, produced by
 * `packages/engine/`. This file formats and places them; it derives no value
 * the user reads, which is the first standing rule and is easiest to break on
 * exactly this kind of screen.
 *
 * The one multiplication in the file is `goal.progress * 100` in `GoalCard`,
 * turning an engine-clamped fraction into a CSS length — the same class of
 * thing as the radius arithmetic inside `ProgressRing`, and it produces no
 * number anybody reads. Stated here rather than left to be discovered, because
 * the previous version of this note claimed there was no arithmetic at all and
 * a docstring that over-claims is how the next reader stops checking.
 */

/** Clears the pinned button so the last row can be scrolled out from under it. */
const BOTTOM_CLEARANCE = TAB_BAR_CLEARANCE + 96

/** Taller than the dashboard card's chart: here the chart is the subject. */
const PLOT_HEIGHT = 200
const CHART_HEIGHT = chartHeight(PLOT_HEIGHT)

/**
 * The windows the range menu offers, shortest first — the same four the
 * dashboard card offers, and the same reasoning: you scan a range control by
 * narrowing, and "All time" is the escape hatch rather than the default.
 *
 * Kept as its own list rather than shared with the card. They agree today, and
 * the reason they might not is that this screen is where a **custom date
 * range** lands when Sriman asks for it — open question 3 on this branch.
 */
const RANGES: readonly DropdownOption<number | "all">[] = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
  { value: "all", label: "All time" },
]

export default function Weight() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [range, setRange] = useState<number | "all">(30)
  const [chartWidth, setChartWidth] = useState(0)

  const { data, isPending, isError, error, refetch, isRefetching } = useWeightSeries(range)

  function openEntry(day?: LogDay) {
    router.push(day ? `/log-weight?date=${day}` : "/log-weight")
  }

  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-[16px]">
        <Text className="font-barlow-bold text-[24px] text-white">Weight</Text>
        <View className="flex-1" />
        <Dropdown
          value={range}
          options={RANGES}
          onChange={setRange}
          accessibilityLabel="Chart range"
        />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: BOTTOM_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.textSecondary}
          />
        }
      >
        {isPending ? (
          <View className="h-[420px]">
            <Loading label="Loading your weigh-ins" />
          </View>
        ) : isError ? (
          <View className="h-[420px]">
            <ErrorState error={error} onRetry={() => void refetch()} />
          </View>
        ) : data.latest === null ? (
          /*
            The genuinely empty state: no weigh-in has ever been recorded.
            `latest` is measured on the **full** history, so this cannot be
            confused with "none in this window", which is a different message
            further down. The action is the whole screen at this point, so the
            empty state carries it rather than making someone find the button.
          */
          <View className="h-[420px] px-[16px]">
            <Empty
              title="No weigh-ins yet"
              detail="Log today's weight and the trend line starts here. One number a day is enough."
              action={{ label: "Log weight", onPress: () => openEntry() }}
            />
          </View>
        ) : (
          <>
            <View className="px-[16px]">
              <TrendHero series={data} />
            </View>

            <View className="mt-[12px] px-[16px]">
              <Card>
                <CardLabel>TREND</CardLabel>
                <View
                  className="mt-[10px]"
                  style={{ height: CHART_HEIGHT }}
                  onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
                >
                  {data.points.length === 0 ? (
                    <Empty
                      title="No weigh-ins in this range"
                      detail="Pick a longer range, or log today's weight."
                    />
                  ) : chartWidth > 0 ? (
                    <TrendChart series={data} width={chartWidth} plotHeight={PLOT_HEIGHT} />
                  ) : null}
                </View>
              </Card>
            </View>

            {data.goal ? (
              <View className="mt-[12px] px-[16px]">
                <GoalCard series={data} />
              </View>
            ) : null}

            <View className="mt-[12px] px-[16px]">
              <History entries={data.entries} onOpen={openEntry} />
            </View>
          </>
        )}
      </ScrollView>

      {/*
        Pinned, and clear of the native tab bar. plan.md's standing rule puts
        primary actions within thumb reach, and on this screen there is exactly
        one action — everything else is reading.
      */}
      <View
        className="absolute inset-x-0 bottom-0 px-[16px]"
        style={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log today's weight"
          onPress={() => openEntry()}
          className="h-[52px] items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          <Text className="font-barlow-semibold text-[17px] text-white">Log weight</Text>
        </Pressable>
      </View>
    </View>
  )
}

/**
 * The trend weight, and the three movements the engine measured.
 *
 * `latest.trend` is the smoothed number, and it is the only large one on the
 * screen. The raw reading that produced it sits under the cells in secondary
 * text with its date — visible, because someone who just stood on a scale wants
 * to see the number they saw, and subordinate, because it is not progress.
 */
function TrendHero({ series }: { series: WeightSeries }) {
  const latest = series.latest!
  const rate = series.projection?.ratePerWeek ?? null

  return (
    <Card>
      <CardLabel>TREND WEIGHT</CardLabel>

      <View className="mt-[8px] flex-row items-baseline">
        <Text className="font-display text-[56px] leading-[60px] text-white">
          {formatKg(latest.trend)}
        </Text>
        <Text className="ml-[6px] font-barlow text-[18px] text-textSecondary">kg</Text>
      </View>

      <View className="mt-[16px] flex-row">
        <Movement label="7 days" change={series.change7d} series={series} />
        <Movement label="30 days" change={series.change30d} series={series} />
        <Rate rate={rate} series={series} />
      </View>

      {/*
        The raw reading, said plainly and said small — and dated, because the
        last time on the scale is usually not today and a bare number would
        imply it was.

        `latest` is the last point of the series, and `trendWeightSeries` ends
        the series **on** a weigh-in, so `weight` is non-null here by contract.
        The other branch exists because the type allows null and a screen that
        assumed otherwise would print "null kg" the day that contract changes.
      */}
      <Text className="mt-[16px] font-barlow text-[14px] text-textSecondary">
        {latest.weight === null
          ? `Last weigh-in ${formatDayWithWeekday(latest.day)}`
          : `Scale said ${formatKg(latest.weight)} kg on ${formatDayWithWeekday(latest.day)}`}
      </Text>
    </Card>
  )
}

/**
 * One measured change, as a cell.
 *
 * Null is a real answer and gets words rather than a dash: the series is
 * shorter than the window, which is a fact about how long someone has been
 * logging, not a missing value.
 */
function Movement({
  label,
  change,
  series,
}: {
  label: string
  change: TrendChangeResponse | null
  series: WeightSeries
}) {
  const goalKg = series.goal?.goalKg
  const color =
    change && goalKg !== undefined
      ? DIRECTION_COLOR[goalDirection(change.from.trend, change.to.trend, goalKg)]
      : colors.textSecondary

  return (
    <View className="flex-1">
      <Text className="font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-textSecondary">
        {label}
      </Text>
      {change ? (
        <Text className="mt-[3px] font-barlow-semibold text-[18px]" style={{ color }}>
          {`${formatSignedKg(change.delta)} kg`}
        </Text>
      ) : (
        <Text className="mt-[3px] font-barlow text-[15px] text-textSecondary">Not yet</Text>
      )}
    </View>
  )
}

/**
 * The weekly rate of loss — the checklist item the engine had already answered
 * and no screen was showing.
 *
 * `ratePerWeek` is `projectTrend()`'s, measured over a 14-day window, and it is
 * signed: negative is a loss. It is not `change7d.delta`, and the difference
 * matters — one is what the last seven days did, the other is the rate the
 * projection is drawn from, and printing the first under the second's name
 * would make the dashed line on the chart look wrong.
 */
function Rate({ rate, series }: { rate: number | null; series: WeightSeries }) {
  const latest = series.latest
  const goalKg = series.goal?.goalKg
  const color =
    rate !== null && latest && goalKg !== undefined
      ? // `rateDirection`, not `goalDirection` with the sum written out here —
        // that addition is a derived number about the user's data, and it
        // belongs in the engine. See the note on the function.
        DIRECTION_COLOR[rateDirection(latest.trend, rate, goalKg)]
      : colors.textSecondary

  return (
    <View className="flex-1">
      <Text className="font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-textSecondary">
        Per week
      </Text>
      {rate === null ? (
        <Text className="mt-[3px] font-barlow text-[15px] text-textSecondary">Not yet</Text>
      ) : (
        <Text className="mt-[3px] font-barlow-semibold text-[18px]" style={{ color }}>
          {`${formatSignedKg(rate)} kg`}
        </Text>
      )}
    </View>
  )
}

/**
 * How far there is to go, and when this rate gets there.
 *
 * Only rendered when a goal weight is set — `goal` is null otherwise, and a
 * card explaining that you have no goal is a card about nothing. The bar is the
 * engine's `progress`, already clamped to 0–1, because being past the goal is
 * arrival rather than information.
 *
 * `goalDay` is null when the current rate never reaches the goal or lands over
 * a year out, and that is said in words. A date a year and a half away is worse
 * than no date: it reads as a promise, and it is drawn from fourteen days of
 * scale readings.
 */
function GoalCard({ series }: { series: WeightSeries }) {
  const goal = series.goal!
  const projection = series.projection

  return (
    <Card>
      <CardLabel>GOAL</CardLabel>

      {/*
        `remainingKg` is signed, and a negative one means the goal is behind
        you. "-1.2 kg to go" is not a sentence, and taking its absolute value
        here to make one would be arithmetic on the screen — so the two cases
        get two sentences instead.
      */}
      {goal.remainingKg > 0 ? (
        <View className="mt-[8px] flex-row items-baseline">
          <Text className="font-barlow-bold text-[24px] text-white">
            {`${formatKg(goal.remainingKg)} kg`}
          </Text>
          <Text className="ml-[6px] font-barlow text-[15px] text-textSecondary">
            {`to go, to ${formatKg(goal.goalKg)} kg`}
          </Text>
        </View>
      ) : (
        <View className="mt-[8px] flex-row items-baseline">
          <Text className="font-barlow-bold text-[24px] text-ok">Goal reached</Text>
          <Text className="ml-[6px] font-barlow text-[15px] text-textSecondary">
            {`${formatKg(goal.goalKg)} kg`}
          </Text>
        </View>
      )}

      {/*
        The engine's `progress`, drawn. The `* 100` is the same class of thing
        as the radius arithmetic inside `ProgressRing` — it turns a fraction
        into a CSS length, and produces no number anybody reads. The value
        itself is already clamped to 0–1 by `goalProgress()`.
      */}
      <View className="mt-[12px] h-[8px] overflow-hidden rounded-full bg-ringTrack">
        <View
          className="h-full rounded-full bg-ok"
          style={{ width: `${goal.progress * 100}%` }}
        />
      </View>

      <Text className="mt-[10px] font-barlow text-[14px] text-textSecondary">
        {projection?.goalDay
          ? `At this rate, ${formatDayWithWeekday(projection.goalDay)}.`
          : "Not enough of a trend yet to say when."}
      </Text>
    </Card>
  )
}

/**
 * The stored weigh-ins, newest first, each one a way into the entry screen.
 *
 * This is where "edit / delete a weight entry" is reached from: tapping a row
 * opens `log-weight` on that day, prefilled, with the delete in its header.
 * There is no swipe-to-delete and no long-press menu — a gesture that destroys
 * a row without a screen in between is the wrong amount of ceremony for the one
 * table in this app where a deletion moves numbers on days other than its own.
 *
 * The rows carry raw readings, and they are styled as the record they are:
 * regular weight, secondary colour for the date, no arrows and no colour.
 */
function History({
  entries,
  onOpen,
}: {
  entries: readonly WeightEntry[]
  onOpen: (day: LogDay) => void
}) {
  const today = currentLoggingDay()

  return (
    <Card>
      <CardLabel>WEIGH-INS</CardLabel>

      {entries.length === 0 ? (
        <Text className="mt-[12px] font-barlow text-[14px] text-textSecondary">
          Nothing recorded in this range.
        </Text>
      ) : (
        <View className="mt-[6px]">
          {entries.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityLabel={`${formatKg(entry.weightKg)} kilograms on ${formatDayWithWeekday(entry.day)}. Edit or delete.`}
              onPress={() => onOpen(entry.day)}
              className="h-[48px] flex-row items-center active:opacity-70"
            >
              <Text className="font-barlow text-[15px] text-textSecondary">
                {entry.day === today ? "Today" : formatDayWithWeekday(entry.day)}
              </Text>
              <View className="flex-1" />
              {/*
                15pt and unbolded, which is the date's own weight. It was 16pt
                semibold, and that made the raw reading the heaviest thing in
                its row — the checklist item this list is cited under is a
                visual-weight rule, so losing it here is losing the whole item.
                White rather than secondary because it is the row's content and
                the date is its label; the size and weight carry the ordering.
              */}
              <Text className="font-barlow text-[15px] text-white">
                {`${formatKg(entry.weightKg)} kg`}
              </Text>
              <View className="ml-[8px]">
                <ChevronRight size={16} />
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  )
}
