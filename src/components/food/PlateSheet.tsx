import { useState } from "react"
import { Pressable, ScrollView, Text, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { Macros } from "@engine"

import { CloseIcon, TickIcon } from "@/components/icons/UiIcons"
import { colors, withAlpha } from "@/design/tokens"
import { formatKcal } from "@/lib/format"
import { draftItemMacros, draftItemQty, draftQtyLabel, type DraftItem } from "@/lib/meal-draft"
import { useKeyboardHeight } from "@/lib/use-keyboard-height"

import { MacroCompact } from "./FoodRow"

/**
 * The plate, opened: what is on it, what it adds up to, and the two things you
 * can do with it.
 *
 * ## Two names that used to be one field
 *
 * The first version had a single "Meal" field doing two jobs: the meal being
 * logged to (Breakfast) **and** the name a saved meal would get. "Save as meal"
 * then saved a meal called "Breakfast" — on the iPhone (2026-10-19) that read
 * as the two clashing, because they did. Now:
 *
 * - **The meal you are logging to** is the sheet's title, chosen in the
 *   logger's Breakfast / Lunch / Dinner / Snack row, not here.
 * - **A saved meal's name** is asked for only when saving one, in its own field,
 *   with an example rather than the slot as its placeholder.
 *
 * Logging is the sheet's one primary action, the white pill at the bottom.
 * Saving for later is secondary and folds away until it is wanted.
 */
export function PlateSheet({
  slot,
  items,
  totals,
  onEdit,
  onClear,
  onLog,
  logging,
  canLog,
  error,
  onSaveMeal,
  saving,
  savedAs,
  onClose,
}: {
  /** The meal being logged to — Breakfast, Lunch, Dinner, Snack. */
  slot: string
  items: readonly DraftItem[]
  totals: Macros
  onEdit: (item: DraftItem) => void
  onClear: () => void
  onLog: () => void
  logging: boolean
  canLog: boolean
  error: string | null
  /** Save the plate to the library under `name`. */
  onSaveMeal: (name: string) => void
  saving: boolean
  /** The name this exact plate was saved under, once it has been. */
  savedAs: string | null
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardHeight()
  const [naming, setNaming] = useState(false)
  const [savedName, setSavedName] = useState("")

  const count = `${items.length} ${items.length === 1 ? "item" : "items"}`
  const canSave = savedName.trim().length > 0 && !saving && items.length > 0

  return (
    <View className="absolute inset-0">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close the plate"
        onPress={onClose}
        className="absolute inset-0"
        style={{ backgroundColor: withAlpha(colors.ground, 0.75) }}
      />

      {/* Not a KeyboardAvoidingView, for the reason in `@/lib/use-keyboard-height`. */}
      <View
        className="flex-1 justify-end"
        pointerEvents="box-none"
        style={{ paddingTop: insets.top + 24, paddingBottom: keyboardHeight }}
      >
        <View
          className="max-h-full rounded-t-[22px] border border-cardBorder bg-card pt-[16px]"
          style={{ paddingBottom: (keyboardHeight > 0 ? 0 : insets.bottom) + 12 }}
        >
          {/* ── The meal, and what it adds up to ─────────────────────────── */}
          <View className="flex-row items-start px-[16px]">
            <View className="flex-1">
              <Text className="font-display text-[28px] leading-[32px] text-white">{slot}</Text>
              <Text className="mt-[2px] font-barlow text-[14px] text-textSecondary">
                {count} · {formatKcal(totals.kcal)} cal
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close the plate"
              onPress={onClose}
              className="-mr-[10px] -mt-[6px] h-[44px] w-[44px] items-center justify-center active:opacity-70"
            >
              <CloseIcon size={18} />
            </Pressable>
          </View>

          <ScrollView
            className="mt-[12px] shrink grow-0 px-[16px]"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {items.length === 0 ? (
              <Text className="py-[24px] text-center font-barlow text-[14px] text-textSecondary">
                Nothing on the plate yet. Tap + beside a food to add it.
              </Text>
            ) : (
              <View className="rounded-[14px] bg-secondary px-[14px]">
                {items.map((item) => {
                  const macros = draftItemMacros(item)
                  return (
                    <Pressable
                      key={item.key}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}, ${draftItemQty(item)}, ${formatKcal(macros.kcal)} calories.${
                        item.mode === "portion" ? " Change the amount." : ""
                      }`}
                      disabled={item.mode !== "portion"}
                      onPress={() => onEdit(item)}
                      className="flex-row items-center border-b border-cardBorder py-[11px] active:opacity-70"
                    >
                      <View className="flex-1 pr-[8px]">
                        <Text numberOfLines={1} className="font-barlow-semibold text-[15px] text-white">
                          {item.name}
                        </Text>
                        <Text numberOfLines={1} className="font-barlow text-[13px] text-textSecondary">
                          {draftQtyLabel(item)}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="font-barlow-medium text-[14px] text-white">
                          {formatKcal(macros.kcal)} cal
                        </Text>
                        <MacroCompact macros={macros} />
                      </View>
                    </Pressable>
                  )
                })}

                <View className="flex-row items-center py-[11px]">
                  <Text className="flex-1 font-barlow-medium text-[13px] uppercase tracking-[0.6px] text-textSecondary">
                    Total
                  </Text>
                  <View className="items-end">
                    <Text className="font-barlow-bold text-[16px] text-white">
                      {formatKcal(totals.kcal)} cal
                    </Text>
                    <MacroCompact macros={totals} />
                  </View>
                </View>
              </View>
            )}

            {/* ── Save for later: secondary, folded away until wanted ────── */}
            {items.length > 0 ? (
              savedAs ? (
                <View className="mt-[12px] h-[44px] flex-row items-center">
                  <TickIcon size={16} color={colors.ok} />
                  <Text numberOfLines={1} className="ml-[8px] flex-1 font-barlow-medium text-[14px] text-white">
                    Saved as “{savedAs}”
                  </Text>
                </View>
              ) : naming ? (
                <View className="mt-[12px]">
                  <Text className="mb-[6px] font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-textSecondary">
                    Name this saved meal
                  </Text>
                  <View className="flex-row items-center gap-[8px]">
                    <TextInput
                      value={savedName}
                      onChangeText={setSavedName}
                      autoFocus
                      placeholder="e.g. Oats and berries"
                      placeholderTextColor={colors.textSecondary}
                      accessibilityLabel="Name for the saved meal"
                      keyboardAppearance="dark"
                      returnKeyType="done"
                      onSubmitEditing={() => canSave && onSaveMeal(savedName.trim())}
                      maxLength={200}
                      className="h-[44px] flex-1 rounded-[10px] border border-buttonBorder bg-secondary px-[12px] font-barlow text-[16px] text-white"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Save the meal"
                      accessibilityState={{ disabled: !canSave, busy: saving }}
                      disabled={!canSave}
                      onPress={() => onSaveMeal(savedName.trim())}
                      className={`h-[44px] items-center justify-center rounded-[10px] px-[16px] ${
                        canSave ? "bg-primary active:opacity-80" : "bg-secondary"
                      }`}
                    >
                      <Text
                        className={`font-barlow-semibold text-[15px] ${canSave ? "text-ground" : "text-textSecondary"}`}
                      >
                        {saving ? "Saving…" : "Save"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View className="mt-[8px] flex-row items-center justify-between">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Save this plate as a meal to log again later"
                    onPress={() => setNaming(true)}
                    className="h-[44px] justify-center active:opacity-70"
                  >
                    <Text className="font-barlow-medium text-[14px] text-link">Save as a meal for later</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Take everything off the plate"
                    onPress={onClear}
                    className="h-[44px] justify-center pl-[12px] active:opacity-70"
                  >
                    <Text className="font-barlow-medium text-[14px] text-textSecondary">Clear plate</Text>
                  </Pressable>
                </View>
              )
            ) : null}
          </ScrollView>

          {/* ── The one primary action ──────────────────────────────────── */}
          <View className="px-[16px] pt-[12px]">
            {error ? <Text className="mb-[8px] font-barlow text-[13px] text-danger">{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Log ${slot}, ${formatKcal(totals.kcal)} calories`}
              accessibilityState={{ disabled: !canLog, busy: logging }}
              disabled={!canLog}
              onPress={onLog}
              className={`h-[52px] flex-row items-center justify-center rounded-full ${
                canLog ? "bg-primary active:opacity-80" : "bg-secondary"
              }`}
            >
              <Text
                className={`font-barlow-semibold text-[16px] ${canLog ? "text-ground" : "text-textSecondary"}`}
              >
                {logging ? "Logging…" : `Log ${slot} · ${formatKcal(totals.kcal)} cal`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}
