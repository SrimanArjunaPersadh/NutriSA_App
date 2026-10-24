import { Text, View } from "react-native"

import { amountOver, type Macros } from "@engine"

import { colors } from "@/design/tokens"
import { formatGrams, formatKcal, formatShare } from "@/lib/format"

/**
 * The top of the Nutrition tab: what is left today, then the three macros.
 *
 * Every well-rated logger leads with the calories **left**, not the calories
 * eaten — Lose It ("118 under"), MyNetDiary ("1,750 left"), Yazio ("868
 * remaining"), Cal AI, MyFitnessPal (`research designs/README.md`, pattern 7).
 * Left is the number a decision is made on: can I have this? So it is the big
 * one, eaten and the target sit under it, and one bar shows how far through the
 * day's budget the day is. The macros follow as three thin bars, "eaten /
 * target" (pattern 8).
 *
 * It replaced a calorie ring that led with **eaten**, which answered a question
 * nobody was asking at the moment of logging.
 *
 * ## Three states besides the plain one
 *
 * - **No targets yet** — every day before the user first sets them. There is no
 *   "left", so the card leads with eaten and says targets are not set, rather
 *   than inventing a budget.
 * - **Over** — `remaining` goes negative on purpose. The card says "Over" with
 *   the amount from `amountOver`, and the bar turns `danger`: over-target is a
 *   designed state, never a minus sign.
 * - **A past day** — "left" still reads correctly; nothing about it says today.
 *
 * Every figure is the server's (`consumed`, `remaining`, `progress`, from the
 * engine) or `amountOver`. Bar widths are `formatShare` of the engine's
 * progress. Nothing here adds or subtracts.
 */
export function CaloriesLeftCard({
  consumed,
  targets,
  remaining,
  progress,
}: {
  consumed: Macros
  targets: Macros | null
  remaining: Macros | null
  progress: Macros | null
}) {
  const over = remaining !== null && remaining.kcal < 0
  const label = targets === null ? "Calories eaten" : over ? "Calories over" : "Calories left"
  const hero =
    targets === null || remaining === null
      ? consumed.kcal
      : over
        ? amountOver(remaining.kcal)
        : remaining.kcal
  const sub =
    targets === null
      ? "No targets set yet"
      : `of ${formatKcal(targets.kcal)} · ${formatKcal(consumed.kcal)} eaten`

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${formatKcal(hero)}. ${sub}.`}
      className="mx-[16px] rounded-[20px] border border-cardBorder bg-card px-[18px] pb-[18px] pt-[16px]"
    >
      <Text className="font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-textSecondary">
        {label}
      </Text>
      <View className="mt-[2px] flex-row items-baseline">
        <Text className={`font-display text-[52px] leading-[56px] ${over ? "text-danger" : "text-white"}`}>
          {formatKcal(hero)}
        </Text>
        <Text className="ml-[10px] flex-1 font-barlow text-[14px] text-textSecondary" numberOfLines={1}>
          {sub}
        </Text>
      </View>

      {progress ? (
        <View className="mt-[10px] h-[6px] overflow-hidden rounded-full bg-ringTrack">
          <View
            className="h-full rounded-full"
            // Runtime width and colour — values, not classes.
            style={{
              width: formatShare(progress.kcal) as `${number}%`,
              backgroundColor: over ? colors.danger : colors.primary,
            }}
          />
        </View>
      ) : null}

      <View className="mt-[16px] flex-row gap-[14px]">
        <MacroBar label="Protein" eaten={consumed.protein} target={targets?.protein} share={progress?.protein} fill={colors.protein} text="text-protein" />
        <MacroBar label="Carbs" eaten={consumed.carbs} target={targets?.carbs} share={progress?.carbs} fill={colors.carbs} text="text-carbs" />
        <MacroBar label="Fat" eaten={consumed.fat} target={targets?.fat} share={progress?.fat} fill={colors.fats} text="text-fats" />
      </View>
    </View>
  )
}

/**
 * "Protein   42/160 g" over a thin bar in the macro's colour. The label and the
 * grams eaten are in that colour too, bold (Sriman, 2026-10-20: the number
 * should match its macro); the target stays grey.
 */
function MacroBar({
  label,
  eaten,
  target,
  share,
  fill,
  text,
}: {
  label: string
  eaten: number
  target: number | undefined
  share: number | undefined
  fill: string
  /** The macro's text-colour class, e.g. `text-protein`. */
  text: string
}) {
  return (
    <View className="flex-1">
      <Text className={`font-barlow-bold text-[13px] ${text}`}>{label}</Text>
      <Text className="mt-[1px] font-barlow text-[12px] text-textSecondary">
        <Text className={`font-barlow-bold text-[14px] ${text}`}>{formatGrams(eaten)}</Text>
        {target !== undefined ? ` / ${formatGrams(target)}` : ""} g
      </Text>
      <View className="mt-[6px] h-[5px] overflow-hidden rounded-full bg-ringTrack">
        <View
          className="h-full rounded-full"
          style={{ width: formatShare(share ?? 0) as `${number}%`, backgroundColor: fill }}
        />
      </View>
    </View>
  )
}
