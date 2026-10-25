import { useState } from "react"
import { Pressable, ScrollView, Text, View } from "react-native"

import { TextField } from "@/components/logging/fields"
import { MacroFields } from "@/components/logging/MealItemRow"
import { emptyDraftItem, toNumber, type DraftItem, type MacroText } from "@/lib/meal-draft"

/**
 * Quick Add: calories and macros straight onto the plate, no food behind them.
 *
 * MacroFactor's Quick Add, and the right tool for a restaurant meal or a label
 * you are reading off a wrapper you will not see again. The line goes on in
 * the meal form's `direct` mode — absolute macros, no portion — which is
 * exactly what it is, so it is stored without the "1 × piece" fiction
 * `toWriteItem` refuses to write.
 *
 * The name is optional because the point is speed. Blank becomes "Quick add",
 * which is still a name the day view can show.
 */
const ZERO: MacroText = { kcal: "", protein: "", carbs: "", fat: "" }

export function QuickAddPanel({ onAdd }: { onAdd: (item: DraftItem) => void }) {
  const [name, setName] = useState("")
  const [macros, setMacros] = useState<MacroText>(ZERO)

  // Something has to be in it. A zero-everything quick add is a blank line.
  const hasValue = [macros.kcal, macros.protein, macros.carbs, macros.fat].some(
    (text) => toNumber(text) > 0,
  )

  function add() {
    if (!hasValue) return
    onAdd({
      ...emptyDraftItem(),
      name: name.trim() || "Quick add",
      mode: "direct",
      macros,
    })
    setName("")
    setMacros(ZERO)
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-[16px] pb-[160px] pt-[16px]"
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row">
        <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder="Quick add" maxLength={200} />
      </View>

      <View className="mt-[6px]">
        <MacroFields
          values={macros}
          onChange={(patch) => setMacros((current) => ({ ...current, ...patch }))}
          accessibilityPrefix="Quick add"
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add to the plate"
        accessibilityState={{ disabled: !hasValue }}
        disabled={!hasValue}
        onPress={add}
        className={`mt-[16px] h-[48px] items-center justify-center rounded-full ${
          hasValue ? "bg-primary active:opacity-80" : "bg-secondary"
        }`}
      >
        <Text className={`font-barlow-semibold text-[16px] ${hasValue ? "text-ground" : "text-textSecondary"}`}>
          Add to plate
        </Text>
      </Pressable>
    </ScrollView>
  )
}
