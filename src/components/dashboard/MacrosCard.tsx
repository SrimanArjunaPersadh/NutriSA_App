import { Pressable, Text, View } from "react-native"

import { Card, CardLabel } from "@/components/dashboard/Card"
import { ProgressRing } from "@/components/dashboard/ProgressRing"
import { macros } from "@/components/dashboard/design-fixture"

const RING_SIZE = 76
const RING_STROKE = 6

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
 */
export function MacrosCard() {
  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <CardLabel>TODAY&apos;S MACROS</CardLabel>

        {/*
          Opens the targets sheet. Left unwired on this branch, which is UI only.
          hitSlop takes the 22pt-tall text up to the 44pt minimum without
          padding the row and pushing the rings down.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit macro targets"
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 8 }}
        >
          <Text className="font-barlow-semibold text-[16px] text-link">Edit Targets</Text>
        </Pressable>
      </View>

      <View className="mt-[16px] flex-row">
        {macros.map((macro) => (
          <View key={macro.key} className="flex-1 items-center">
            <ProgressRing
              size={RING_SIZE}
              strokeWidth={RING_STROKE}
              progress={macro.progress}
              color={macro.color}
            >
              <View className="flex-row items-baseline">
                <Text className="font-display text-[23px] leading-[26px] text-white">
                  {macro.value}
                </Text>
                {macro.unit ? (
                  <Text className="ml-[2px] font-barlow-medium text-[12px] text-white">
                    {macro.unit}
                  </Text>
                ) : null}
              </View>
            </ProgressRing>

            <Text
              className="mt-[10px] font-barlow-semibold text-[13px] tracking-[0.6px]"
              style={{ color: macro.color }}
            >
              {macro.label}
            </Text>
            {/*
              Was 13px and squeezed: four columns left about 82pt each and
              "430 kcal left" wrapped to two lines at 14px, dropping the row out
              of alignment. Three columns give ~110pt and the longest caption
              left is "119 g left", so 14px fits with room to spare.
              `numberOfLines` stays — a real target of 1,000 g would be longer
              than any of these, and one wrapped caption still breaks the
              baseline the other two sit on.
            */}
            <Text
              numberOfLines={1}
              className="mt-[6px] font-barlow text-[14px] text-white/70"
            >
              {macro.remaining}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  )
}
