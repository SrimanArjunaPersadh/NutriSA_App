import { Pressable, Text, View } from "react-native"

import { Card, CardLabel } from "@/components/dashboard/Card"
import { ProgressRing } from "@/components/dashboard/ProgressRing"
import { macros } from "@/components/dashboard/design-fixture"

const RING_SIZE = 68
const RING_STROKE = 5

/**
 * Four rings across: calories, then the three macros in their reserved token
 * colours. The colours are the whole point of the card — the ring, the label
 * under it and nothing else share a hue, so the eye can jump straight to the
 * macro it cares about without reading a word.
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
              Four columns share the card width, so on a 393pt screen each gets
              about 82pt. "430 kcal left" measures right at that limit at 14px
              and wraps to two lines, which drops the row out of alignment —
              13px and a hard single line keep all four captions on one baseline.
            */}
            <Text
              numberOfLines={1}
              className="mt-[4px] font-barlow text-[13px] text-white/70"
            >
              {macro.remaining}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  )
}
