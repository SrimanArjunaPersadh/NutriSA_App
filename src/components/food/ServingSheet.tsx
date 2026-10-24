import { useState } from "react"
import { Pressable, ScrollView, Text, TextInput, View } from "react-native"
import { Image } from "expo-image"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import {
  amountForMeasure,
  amountOver,
  fractionOfQuantity,
  macroEnergyShares,
  measureCount,
  measureLabel,
  pluralNoun,
  portionLabel,
  portionRange,
  quantityAtFraction,
  remainingMacros,
  servingPresets,
  stepQuantity,
  sumMacros,
  type Macros,
  type PortionUnit,
  type ServingPreset,
} from "@engine"

import { CloseIcon } from "@/components/icons/UiIcons"
import { basisLabel } from "@/components/logging/MealItemRow"
import { AmountSlider } from "@/components/ui/AmountSlider"
import { colors, withAlpha } from "@/design/tokens"
import { formatGrams, formatKcal, formatShare, parseDecimal } from "@/lib/format"
import { draftItemMacros, type DraftItem } from "@/lib/meal-draft"
import { useDebouncedValue } from "@/lib/use-debounced-value"
import { useKeyboardHeight } from "@/lib/use-keyboard-height"

/**
 * The food detail sheet: one food, how much of it, and what that contains —
 * `src/design/nutrition_tabs.jpeg`, third screen.
 *
 * Top to bottom, as the reference draws it: the packet photo on white, the
 * name with a calorie badge, each macro's **share of the energy** as a bar
 * (that is the reference's "P 18g / 80%" — 18 g of protein is 72 of the 90
 * kcal), the amount as a field and a slider, and one full-width button.
 *
 * Departures from the reference: its colours are the app's tokens (main
 * button copper, macros in their bold token colours: protein blue, carbs
 * yellow, fat pink), never the mock's own.
 *
 * Every number is the engine's: the macros through `draftItemMacros`
 * (`scalePortion`), the shares through `macroEnergyShares`, and the slider's
 * grams through `quantityAtFraction`. The sheet holds text and positions.
 *
 * Used to add a food and to correct a line already on a plate or a saved meal;
 * `onRemove` is what tells the two apart. The amount field is **not** focused
 * on open any more — the slider is the fast path, and a keyboard over it would
 * hide it.
 *
 * ## From the research (2026-10-20)
 *
 * Three additions, each from an app that logs faster
 * (`research designs/README.md`):
 *
 * - **− and + beside the amount**, one slider step each (Cal AI's stepper).
 * - **One-tap amounts** under it: the serving, 100 g, half (`servingPresets`).
 *   Most edits are one of those, so most edits are one tap.
 * - **What is left of the day after this food** (MacroFactor's food detail
 *   shows its effect on your day). `budget` carries the day's consumed and
 *   targets and what else is on the plate; the figure is the engine's
 *   `remainingMacros` over `sumMacros` of the three. Without targets the row
 *   is not drawn.
 *
 * The button says what it adds and where: "Add to Breakfast · 90 kcal".
 *
 * ## Counting in bananas (2026-10-20)
 *
 * A food with a natural unit (`item.measure`: a slice of bread, a banana)
 * opens counting in it: the field says 1, the word beside it says "banana",
 * − and + move by half a banana, and the line under the name reads "1 banana
 * (118 g)". A **bananas | g** switch above the field flips to grams for anyone
 * weighing. The amount underneath is always grams — `amountForMeasure` and
 * `measureCount` convert at the field — so the slider, the chips and the
 * macros work exactly as they do for a food counted in grams.
 */
export function ServingSheet({
  item,
  detail,
  serving,
  imageUrl,
  confirmLabel,
  onConfirm,
  onRemove,
  onClose,
  budget,
}: {
  item: DraftItem
  /** One line under the name — brand, source. */
  detail?: string | null | undefined
  /** The label's serving, offered as a one-tap reset. */
  serving?: { quantity: number; label: string } | null | undefined
  /** The packet photo, when Open Food Facts has one. */
  imageUrl?: string | null | undefined
  /** "Add to Breakfast", "Update". The kcal is appended here, live. */
  confirmLabel: string
  onConfirm: (item: DraftItem) => void
  onRemove?: (() => void) | undefined
  onClose: () => void
  /**
   * The day this food would land on: what is eaten, the targets, and the rest
   * of the plate (without this line, when editing it). Null hides the row.
   */
  budget?: { consumed: Macros; targets: Macros; others: Macros; today: boolean } | null | undefined
}) {
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardHeight()
  const [quantity, setQuantity] = useState(item.quantity)

  /** The food's natural unit, for a g or ml line that has one. */
  const measure = item.measure && (item.unit === "g" || item.unit === "ml") ? item.measure : null
  /** Counting in the measure (bananas) or in the base unit (grams). Measure first. */
  const [inMeasure, setInMeasure] = useState(measure !== null)
  /** The field's text while counting, as typed: "1.5", "2", "". */
  const [countText, setCountText] = useState(() =>
    measure ? String(measureCount(parseDecimal(item.quantity) ?? 0, measure)) : "",
  )
  const counting = measure !== null && inMeasure
  /** − and + while counting: half a measure a step, fixed on open like the slider. */
  const [countRange] = useState(() =>
    portionRange("serving", measure ? measureCount(parseDecimal(item.quantity) ?? 0, measure) : 1),
  )
  /** True while the last change came from the slider; see the debounce below. */
  const [sliding, setSliding] = useState(false)
  /** True while a finger is on the slider: the sheet must not scroll under it. */
  const [dragging, setDragging] = useState(false)

  /**
   * The slider's scale, fixed when the sheet opens. Recomputing it from the
   * live amount would move the far end while the thumb is being dragged.
   */
  const [range] = useState(() =>
    portionRange(item.unit, serving?.quantity ?? parseDecimal(item.quantity) ?? 0),
  )

  /**
   * plan.md: everything computed from a typed gram field waits 300ms behind it,
   * so typing "150" does not flash 1 and 15. A drag is not typing — every
   * position is a real amount — so it settles immediately.
   *
   * The **string** is debounced, never a draft object built from it: a fresh
   * object every render re-arms the debounce forever, which is how the first
   * version of this sheet re-rendered itself every 300ms while open.
   */
  const settledQuantity = useDebouncedValue(quantity, sliding ? 0 : 300)
  const macros = draftItemMacros({ ...item, quantity: settledQuantity })
  const shares = macroEnergyShares(macros)

  const amount = parseDecimal(quantity)
  const valid = amount !== null && amount > 0
  const amountText = !valid
    ? "This amount"
    : measure
      ? measureLabel(amount, measure, item.unit)
      : portionLabel(amount, item.unit)
  const count = measure ? measureCount(amount ?? 0, measure) : 0

  /** Fixed on open, like the range: the chips must not move while being tapped. */
  const [presets] = useState(() =>
    servingPresets(item.unit, serving?.quantity ?? parseDecimal(item.quantity) ?? 0),
  )

  const left = budget
    ? remainingMacros(sumMacros([budget.consumed, budget.others, macros]), budget.targets).kcal
    : null

  function typed(text: string) {
    setSliding(false)
    if (counting) {
      // Bananas typed, grams kept: the amount stays the one source of truth.
      setCountText(text)
      const typedCount = parseDecimal(text)
      setQuantity(typedCount === null ? "" : String(amountForMeasure(typedCount, measure)))
      return
    }
    setQuantity(text)
  }

  function slid(next: number) {
    setSliding(true)
    setQuantity(String(next))
    if (measure) setCountText(String(measureCount(next, measure)))
  }

  /** − and +: half a measure while counting, one slider step in grams. */
  function step(direction: 1 | -1) {
    if (counting) slid(amountForMeasure(stepQuantity(count, direction, countRange), measure))
    else slid(stepQuantity(amount ?? 0, direction, range))
  }

  function switchUnit(toMeasure: boolean) {
    setInMeasure(toMeasure)
    if (toMeasure && measure) setCountText(String(measureCount(amount ?? 0, measure)))
  }

  return (
    <View className="absolute inset-0">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        className="absolute inset-0"
        // A value, not a class: the scrim is a token at an alpha.
        style={{ backgroundColor: withAlpha(colors.ground, 0.75) }}
      />

      {/* Not a KeyboardAvoidingView, for the reason in `@/lib/use-keyboard-height`. */}
      <View
        className="flex-1 justify-end"
        pointerEvents="box-none"
        style={{ paddingTop: insets.top + 12, paddingBottom: keyboardHeight }}
      >
        <View className="max-h-full overflow-hidden rounded-t-[22px] border border-cardBorder bg-card">
          {imageUrl ? (
            <View className="h-[150px] items-center justify-center bg-pureWhite">
              <Image
                source={{ uri: imageUrl }}
                contentFit="contain"
                className="h-[130px] w-full"
                accessible={false}
                transition={150}
              />
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            className="absolute right-[6px] top-[6px] z-10 h-[44px] w-[44px] items-center justify-center active:opacity-70"
          >
            <View className="h-[30px] w-[30px] items-center justify-center rounded-full bg-ground/70">
              <CloseIcon size={15} />
            </View>
          </Pressable>

          <ScrollView
            // Shrinks rather than pushing the button off the sheet when the
            // keyboard takes half the screen.
            className="shrink grow-0"
            // Off while the slider is held, or a thumb that drifts vertically
            // scrolls the sheet as well (iPhone, 2026-10-20). No bounce when it
            // all fits, so the sheet only ever moves when there is more to see.
            scrollEnabled={!dragging}
            alwaysBounceVertical={false}
            contentContainerClassName="px-[16px] pb-[8px] pt-[16px]"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Name and the calorie badge ──────────────────────────── */}
            <View className="flex-row items-center">
              <View className="flex-1 pr-[12px]">
                <Text numberOfLines={2} className="font-display text-[26px] leading-[30px] text-white">
                  {item.name}
                </Text>
                <Text numberOfLines={1} className="mt-[2px] font-barlow text-[14px] text-textSecondary">
                  {[detail, amountText].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <View
                accessible
                accessibilityLabel={`${formatKcal(macros.kcal)} calories`}
                className="h-[68px] w-[68px] items-center justify-center rounded-full bg-secondary"
              >
                <Text className="font-display text-[24px] leading-[26px] text-white">
                  {formatKcal(macros.kcal)}
                </Text>
                <Text className="font-barlow-medium text-[11px] text-white">cal</Text>
              </View>
            </View>

            {/* ── Where the energy comes from ─────────────────────────── */}
            <View className="mt-[16px] gap-[12px] rounded-[14px] bg-secondary p-[14px]">
              <MacroBar label="Protein" grams={macros.protein} share={shares.protein} tone="protein" />
              <MacroBar label="Carbs" grams={macros.carbs} share={shares.carbs} tone="carbs" />
              <MacroBar label="Fat" grams={macros.fat} share={shares.fat} tone="fats" />
            </View>

            {/* ── How much: − field +, one-tap amounts, the slider ───────── */}
            <View className="mt-[12px] rounded-[14px] bg-secondary px-[14px] pb-[6px] pt-[12px]">
              {measure ? (
                <View className="mb-[10px] flex-row items-center">
                  <Text className="flex-1 font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-textSecondary">
                    Amount in
                  </Text>
                  <View className="flex-row rounded-full border border-buttonBorder bg-card p-[3px]">
                    {[
                      { on: true, label: pluralNoun(measure.noun, 2) },
                      { on: false, label: item.unit },
                    ].map((choice) => {
                      const selected = inMeasure === choice.on
                      return (
                        <Pressable
                          key={choice.label}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Count in ${choice.label}`}
                          onPress={() => switchUnit(choice.on)}
                          // 30 + 7 + 7 = 44pt, the minimum target.
                          hitSlop={{ top: 7, bottom: 7 }}
                          className={`h-[30px] justify-center rounded-full px-[12px] ${selected ? "bg-white" : ""}`}
                        >
                          <Text
                            className={`font-barlow-medium text-[13px] ${selected ? "text-ground" : "text-textSecondary"}`}
                          >
                            {choice.label}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              ) : null}
              <View className="flex-row items-center gap-[8px]">
                <StepButton label={`Less ${item.name}`} glyph="−" onPress={() => step(-1)} />
                <View className="h-[52px] flex-1 flex-row items-center rounded-[12px] border border-buttonBorder bg-card px-[14px]">
                  <TextInput
                    value={counting ? countText : quantity}
                    onChangeText={typed}
                    keyboardType="decimal-pad"
                    keyboardAppearance="dark"
                    selectTextOnFocus
                    accessibilityLabel={`Amount of ${item.name} in ${
                      counting && measure ? pluralNoun(measure.noun, 2) : unitWord(item.unit)
                    }`}
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                    // A fixed width for the number, so the unit word beside it
                    // ("tablespoons") gets the rest of the box instead of being
                    // squeezed to "tables…" (iPhone, 2026-10-20).
                    className="h-full w-[72px] font-barlow-semibold text-[22px] text-white"
                  />
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    className="ml-[6px] flex-1 font-barlow text-[15px] text-textSecondary"
                  >
                    {counting && measure ? pluralNoun(measure.noun, count) : unitWord(item.unit, amount ?? 0)}
                  </Text>
                </View>
                <StepButton label={`More ${item.name}`} glyph="+" onPress={() => step(1)} />
              </View>

              {presets.length > 0 ? (
                <View className="mt-[10px] flex-row flex-wrap gap-[8px]">
                  {presets.map((preset) => {
                    const selected = amount === preset.quantity
                    return (
                      <Pressable
                        key={preset.kind}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Use ${presetLabel(preset, item.unit, serving?.label)}`}
                        onPress={() => slid(preset.quantity)}
                        hitSlop={{ top: 4, bottom: 4 }}
                        className={`h-[36px] justify-center rounded-full border px-[14px] active:opacity-80 ${
                          selected ? "border-white bg-white" : "border-buttonBorder bg-card"
                        }`}
                      >
                        <Text
                          numberOfLines={1}
                          className={`font-barlow-medium text-[14px] ${selected ? "text-ground" : "text-white"}`}
                        >
                          {presetLabel(preset, item.unit, serving?.label)}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              ) : null}

              <AmountSlider
                fraction={fractionOfQuantity(amount ?? 0, range)}
                onFraction={(fraction) => slid(quantityAtFraction(fraction, range))}
                onStep={(direction) => slid(stepQuantity(amount ?? 0, direction, range))}
                accessibilityLabel={`Amount of ${item.name}`}
                accessibilityValue={amountText}
                onDragging={setDragging}
              />
            </View>

            {/* ── What it does to the day ─────────────────────────────── */}
            {budget && left !== null ? (
              <View className="mt-[10px] flex-row items-center rounded-[14px] bg-secondary px-[14px] py-[12px]">
                <Text className="flex-1 font-barlow text-[14px] text-textSecondary">
                  {budget.today ? "Left today after this" : "Left that day after this"}
                </Text>
                <Text className={`font-barlow-bold text-[15px] ${left < 0 ? "text-danger" : "text-white"}`}>
                  {left < 0 ? `${formatKcal(amountOver(left))} cal over` : `${formatKcal(left)} cal`}
                </Text>
              </View>
            ) : null}

            <Text className="mt-[8px] font-barlow text-[12px] text-textSecondary">
              Label: {formatKcal(parseDecimal(item.per.kcal) ?? 0)} cal {basisLabel(item.unit)}
            </Text>
          </ScrollView>

          {/* ── The one action ─────────────────────────────────────────── */}
          <View
            className="flex-row gap-[10px] px-[16px] pt-[10px]"
            style={{ paddingBottom: (keyboardHeight > 0 ? 0 : insets.bottom) + 12 }}
          >
            {onRemove ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.name}`}
                onPress={onRemove}
                className="h-[52px] items-center justify-center rounded-[14px] border border-buttonBorder px-[18px] active:opacity-80"
              >
                <Text className="font-barlow-semibold text-[15px] text-danger">Remove</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ disabled: !valid }}
              disabled={!valid}
              onPress={() => onConfirm({ ...item, quantity })}
              className={`h-[52px] flex-1 items-center justify-center rounded-full ${
                valid ? "bg-primary active:opacity-80" : "bg-secondary"
              }`}
            >
              <Text
                numberOfLines={1}
                className={`font-barlow-semibold text-[16px] ${valid ? "text-ground" : "text-textSecondary"}`}
              >
                {valid ? `${confirmLabel} · ${formatKcal(macros.kcal)} cal` : confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}

const TONE = {
  protein: { text: "text-protein", fill: colors.protein },
  carbs: { text: "text-carbs", fill: colors.carbs },
  fats: { text: "text-fats", fill: colors.fats },
} as const

/** "Protein ........ 18 g  80%" over a bar filled to the share. */
function MacroBar({
  label,
  grams,
  share,
  tone,
}: {
  label: string
  grams: number
  share: number
  tone: keyof typeof TONE
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${formatGrams(grams)} grams, ${formatShare(share)} of the energy`}
    >
      <View className="flex-row items-baseline">
        <Text className={`flex-1 font-barlow-bold text-[14px] ${TONE[tone].text}`}>{label}</Text>
        <Text className={`font-barlow-bold text-[14px] ${TONE[tone].text}`}>
          {formatGrams(grams)} g
        </Text>
        <Text className="ml-[6px] w-[38px] text-right font-barlow text-[13px] text-textSecondary">
          {formatShare(share)}
        </Text>
      </View>
      <View className="mt-[6px] h-[5px] overflow-hidden rounded-full bg-ringTrack">
        <View
          className="h-full rounded-full"
          // Runtime width and colour — values, not classes.
          style={{ width: formatShare(share) as `${number}%`, backgroundColor: TONE[tone].fill }}
        />
      </View>
    </View>
  )
}

/** A square − or + beside the amount field: one slider step, 52pt to match the field. */
function StepButton({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-[52px] w-[52px] items-center justify-center rounded-[12px] border border-buttonBorder bg-card active:opacity-70"
    >
      <Text className="font-barlow-medium text-[24px] text-white">{glyph}</Text>
    </Pressable>
  )
}

/** "1 tub (175 g)", "100 g", "Half", "Double". */
function presetLabel(preset: ServingPreset, unit: PortionUnit, servingLabel: string | undefined): string {
  switch (preset.kind) {
    case "serving":
      return servingLabel ?? portionLabel(preset.quantity, unit)
    case "hundred":
      return portionLabel(preset.quantity, unit)
    case "half":
      return "Half"
    case "double":
      return "Double"
  }
}

/** "g", "slices", "cups" — the unit word for an amount, from `portionLabel`'s rules. */
function unitWord(unit: PortionUnit, amount = 2): string {
  return portionLabel(amount, unit).split(" ").slice(1).join(" ")
}
