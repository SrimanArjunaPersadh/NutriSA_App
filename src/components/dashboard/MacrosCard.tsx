import { Pressable, Text, View } from "react-native"

import type { Macros } from "@shared"

import { Card, CardLabel } from "@/components/dashboard/Card"
import { ProgressRing } from "@/components/dashboard/ProgressRing"
import { Empty, ErrorState, Loading } from "@/components/state"
import { formatGrams } from "@/lib/format"
import { useDaySummary } from "@/lib/queries"
import { colors } from "@/design/tokens"

const RING_SIZE = 76
const RING_STROKE = 6

/** Height held across all four states so the page does not jump. */
const CARD_BODY_HEIGHT = 138

/**
 * Three rings across — protein, carbs and fat, in their reserved token colours.
 * The colours are the whole point of the card: the ring, the label under it and
 * nothing else share a hue, so the eye can jump straight to the macro it cares
 * about without reading a word.
 *
 * Calories used to be a fourth ring here and moved to the hero card above,
 * where the figure is the screen's headline rather than one of four. Three
 * columns instead of four give each ring about 110pt of a 393pt screen instead
 * of 82, which is why the ring grew from 68 to 76 and why the caption below can
 * breathe — see the note on that Text.
 *
 * ## The three macros are a constant; their values are not
 *
 * Which rings exist, in what order, in what colour, is a design decision and
 * lives here. What goes in them comes from the day summary. The old fixture
 * conflated the two — it shipped a `MacroRing[]` with values baked in — which
 * is why swapping it for live data touched every line of this file.
 */
/**
 * ## Protein, carbs, fat — the app's one display order, decided here
 *
 * Settled 2026-08-20, after a detour worth recording. `src/design/nutrition_ui.png`
 * prints its rows as `204 Cal • 23P • 7F • 0C`, so the order was briefly changed
 * to protein-fat-carbs to match it — then `nutrition_ui2.png` arrived with its
 * three macro cards in **protein, carbs, fat**, the two references disagreed,
 * and Sriman's call was carbs second. The lesson is the small one: a mock is
 * evidence, not an instruction, and two mocks can be evidence of different
 * things.
 *
 * Every surface reads this order: the rings here, the entry form's four fields
 * and its two total lines, `CalorieDonut`'s arcs and the three cards on the
 * Nutrition tab.
 *
 * Worth stating plainly because it is not obvious from any one file: **the
 * order a macro is *displayed* in is a design decision made once, and the order
 * the `Macros` type declares its keys in has nothing to do with it.** The type
 * is still `{kcal, protein, carbs, fat}` and must not be reshuffled to match —
 * object key order is not a contract, and chasing it would touch the engine,
 * every schema and the migration for a visual decision.
 */
const MACRO_RINGS = [
  { key: "protein", label: "PROTEIN", color: colors.protein },
  { key: "carbs", label: "CARBS", color: colors.carbs },
  { key: "fat", label: "FAT", color: colors.fats },
] as const satisfies readonly {
  key: keyof Omit<Macros, "kcal">
  label: string
  color: string
}[]

export function MacrosCard() {
  const { data, isPending, isError, error, refetch } = useDaySummary()

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <CardLabel>TODAY&apos;S MACROS</CardLabel>

        {/*
          Opens the targets sheet. Still unwired — the targets screen is its own
          branch — so it keeps the disabled state that says so to VoiceOver.
          hitSlop takes the 22pt-tall text up to the 44pt minimum without
          padding the row and pushing the rings down.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit macro targets"
          accessibilityState={{ disabled: true }}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 8 }}
        >
          <Text className="font-barlow-semibold text-[16px] text-link">Edit Targets</Text>
        </Pressable>
      </View>

      <View className="mt-[16px]" style={{ height: CARD_BODY_HEIGHT }}>
        {isPending ? (
          <Loading />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : !data.targets || !data.remaining || !data.progress ? (
          <Empty
            title="No macro targets yet"
            detail="Set your targets to track protein, carbs and fat."
          />
        ) : (
          <View className="flex-row">
            {MACRO_RINGS.map((ring) => {
              const consumed = data.consumed[ring.key]
              const left = data.remaining![ring.key]
              const over = left < 0

              return (
                <View key={ring.key} className="flex-1 items-center">
                  <ProgressRing
                    size={RING_SIZE}
                    strokeWidth={RING_STROKE}
                    progress={data.progress![ring.key]}
                    // Over target turns the ring red. The macro's own colour is
                    // its identity, so losing it is the signal — a full purple
                    // ring and an over-target purple ring look identical.
                    color={over ? colors.danger : ring.color}
                  >
                    <View className="flex-row items-baseline">
                      <Text className="font-display text-[23px] leading-[26px] text-white">
                        {formatGrams(consumed)}
                      </Text>
                      <Text className="ml-[2px] font-barlow-medium text-[12px] text-white">
                        g
                      </Text>
                    </View>
                  </ProgressRing>

                  <Text
                    className="mt-[10px] font-barlow-semibold text-[13px] tracking-[0.6px]"
                    style={{ color: ring.color }}
                  >
                    {ring.label}
                  </Text>
                  {/*
                    Was 13px and squeezed: four columns left about 82pt each and
                    "430 kcal left" wrapped to two lines at 14px, dropping the row
                    out of alignment. Three columns give ~110pt and the longest
                    caption left is "119 g left", so 14px fits with room to spare.
                    `numberOfLines` stays — a real target of 1,000 g would be
                    longer than any of these, and one wrapped caption still breaks
                    the baseline the other two sit on.
                  */}
                  <Text
                    numberOfLines={1}
                    className={`mt-[6px] font-barlow text-[14px] ${
                      over ? "" : "text-white/70"
                    }`}
                    // Only set when over, so the className above keeps owning
                    // the normal case — `undefined` here does not override it.
                    style={over ? { color: colors.danger } : undefined}
                  >
                    {over
                      ? `${formatGrams(Math.abs(left))} g over`
                      : `${formatGrams(left)} g left`}
                  </Text>
                </View>
              )
            })}
          </View>
        )}
      </View>
    </Card>
  )
}
