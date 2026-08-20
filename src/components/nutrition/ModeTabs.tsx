import { Pressable, Text, View } from "react-native"

import {
  PlusCircleIcon,
  ScanIcon,
  SearchIcon,
  SparkleIcon,
} from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"

/**
 * The four ways to add food, as a row of modes — `src/design/nutrition_ui.png`.
 *
 * Scan, Search, AI, Quick Add. This is the tiered logging flow from plan.md
 * made visible: scan first, search second, ask third, type last. The order in
 * the reference is that order, and it is not alphabetical or arbitrary.
 *
 * ## Not a `NativeTabs`, and not navigation
 *
 * These switch what the body of *this* screen shows. They are content, not
 * routes — AGENTS.md is unambiguous that the app's tab bar is the platform's
 * and that a JS tab bar is off the table, and this is neither. It is a
 * segmented control that happens to look like tabs, which is what the reference
 * draws.
 *
 * ## Three of the four are shells
 *
 * Only **Quick Add** reaches anything today: it opens the manual entry form.
 * Scan needs the camera and the OCR path (Phase 8), Search needs the food
 * library (Phase 6), AI needs the assistant (Phase 9). They render, they say
 * they are not ready, and they do not pretend otherwise — a mode that switches
 * to an empty panel teaches the user the app is broken.
 */

export type LogMode = "scan" | "search" | "ai" | "quick-add"

const MODES: readonly {
  id: LogMode
  label: string
  Icon: (props: { size?: number; color?: string }) => React.ReactElement
  ready: boolean
}[] = [
  { id: "scan", label: "Scan", Icon: ScanIcon, ready: false },
  { id: "search", label: "Search", Icon: SearchIcon, ready: false },
  { id: "ai", label: "AI", Icon: SparkleIcon, ready: false },
  { id: "quick-add", label: "Quick Add", Icon: PlusCircleIcon, ready: true },
]

export function ModeTabs({
  active,
  onChange,
}: {
  active: LogMode
  onChange: (mode: LogMode) => void
}) {
  return (
    <View className="flex-row border-b border-cardBorder px-[10px]">
      {MODES.map((mode) => {
        const isActive = mode.id === active
        return (
          <Pressable
            key={mode.id}
            accessibilityRole="tab"
            accessibilityLabel={mode.ready ? mode.label : `${mode.label}, not ready yet`}
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(mode.id)}
            // 44pt tall including the indicator, which is the standing minimum
            // and the reason this row is not the 32pt the reference implies.
            className="flex-1 items-center pt-[10px] active:opacity-70"
          >
            <View className="h-[26px] flex-row items-center">
              <mode.Icon
                size={16}
                color={isActive ? colors.white : colors.textSecondary}
              />
              <Text
                className={`ml-[6px] text-[14px] ${
                  isActive
                    ? "font-barlow-semibold text-white"
                    : "font-barlow-medium text-textSecondary"
                }`}
              >
                {mode.label}
              </Text>
            </View>

            {/*
              The indicator is always rendered and only ever changes colour.
              Mounting it conditionally would change the row's height by two
              points as the selection moves, which is a visible twitch under the
              thumb on the one control the user is tapping.
            */}
            <View
              className={`mt-[8px] h-[2px] w-[70%] rounded-full ${
                isActive ? "bg-white" : "bg-transparent"
              }`}
            />
          </Pressable>
        )
      })}
    </View>
  )
}
