import { useEffect, useRef, useState } from "react"
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { currentLoggingDay, isLogDay, slotOfMeal, type LogDay, type Macros } from "@engine"
import type { DayMeal, PatchMeal } from "@shared"

import { IngredientLine, TotalsCard } from "@/components/food/MealBreakdown"
import { ServingSheet } from "@/components/food/ServingSheet"
import { WeighSheet } from "@/components/food/WeighSheet"
import { ChevronLeft, TrashIcon } from "@/components/icons/UiIcons"
import { TextField } from "@/components/logging/fields"
import { ErrorState, Loading } from "@/components/state"
import { colors } from "@/design/tokens"
import { ApiError } from "@/lib/api"
import { formatDayWithWeekday } from "@/lib/format"
import {
  draftItemFromLogged,
  draftItemMacros,
  draftItemQty,
  draftTotals,
  isDraftItemComplete,
  autoWeighedDraftItem,
  draftQtyLabel,
  needsWeight,
  storedItemQty,
  normaliseLoggedTime,
  toWriteItem,
  type DraftItem,
} from "@/lib/meal-draft"
import { useDaySummary, useDeleteMeal, useUpdateMeal } from "@/lib/queries"
import { deleteErrorMessage, MEAL_WORDING, saveErrorMessage } from "@/lib/save-message"
import { useKeyboardVisible } from "@/lib/use-keyboard-visible"

/**
 * One logged meal: what was in it, and — only when asked — changing it.
 *
 * ## View first, edit on request (2026-10-20)
 *
 * Tapping a meal on the Nutrition tab used to open `log-meal.tsx` (deleted), the manual
 * entry form: every line a row of Item / Amount / Energy / Protein / Carbs /
 * Fat fields. Sriman: "I just want to see the full list of ingredients along
 * with its macros... If I want to edit the meal, I should click on the meal and
 * click edit." The apps that do this well agree: MacroFactor opens a logged
 * food as a breakdown and edits it from an **Edit** action; Foodnoms opens an
 * entry to view it, with delete as its own button. So:
 *
 * - **View** (what opens): the meal's name, its slot and time, the totals with
 *   each macro's grams and share of the energy, and every ingredient with its
 *   amount, calories and macros. One button, **Edit meal**, in thumb reach.
 * - **Edit** (same screen): name and time become fields; each ingredient opens
 *   the same amount panel the logger uses (`ServingSheet`), with Remove. A line
 *   with no real weight behind it (the old app's "2g" of sourdough at 180 kcal)
 *   is weighed once first (`WeighSheet`), then opens on the gram slider like
 *   every other ingredient; one with a true weight ("200g") converts without
 *   asking. Before that they were locked, then a numbers form, then "1
 *   serving", which said nothing about grams (iPhone, 2026-10-20). **Save changes** or **Cancel**, and
 *   **Delete this meal** at the foot of the list.
 *
 * ## Less tapping (2026-10-20)
 *
 * The view has a trash button in its header, so deleting from here is open,
 * trash, confirm. From the Nutrition tab it is shorter still: swipe the row
 * left (`SwipeActions`), Delete, confirm; or swipe and Edit, which arrives here
 * with `edit=1` and opens already editing.
 *
 * Adding a forgotten food is the meal card's `+` on the Nutrition tab, which
 * logs it under the same slot.
 *
 * ## The header stays authoritative until the lines change
 *
 * Same rule as `saved-meal.tsx`: a rename or a new time sends neither `items`
 * nor `macros`. Only when a line changes are the lines rewritten, with the
 * header recomputed by the engine (`draftTotals`) from the lines written. A
 * migrated meal whose header does not sum from its lines keeps its calories
 * through a rename.
 *
 * ## Four states
 *
 * Loading and error belong to the day this meal is read out of; a meal that is
 * not in it (deleted elsewhere) gets its own not-found. Save and delete each
 * have their own pending and failure line.
 */
export default function MealScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const keyboardVisible = useKeyboardVisible()
  const params = useLocalSearchParams<{ date?: string; id?: string; edit?: string }>()

  /** Validated, never trusted — same rule as `add-food.tsx`. */
  const [day] = useState<LogDay>(() =>
    typeof params.date === "string" && isLogDay(params.date) ? params.date : currentLoggingDay(),
  )
  const summary = useDaySummary(day)
  const meal = summary.data?.meals.find((row) => row.id === params.id)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState("")
  const [time, setTime] = useState("")
  const [items, setItems] = useState<DraftItem[]>([])
  const [itemsDirty, setItemsDirty] = useState(false)
  const [sheet, setSheet] = useState<DraftItem | null>(null)
  /** An ingredient saved without a real weight, being weighed before it can be scaled. */
  const [weighing, setWeighing] = useState<DraftItem | null>(null)

  /**
   * Tapping an ingredient in edit mode: the amount panel, in grams. A line
   * stored without a real weight is converted first: by itself when its amount
   * already is one ("200g"), else by asking (`WeighSheet`).
   */
  function openLine(item: DraftItem) {
    if (!needsWeight(item)) return setSheet(item)
    const weighed = autoWeighedDraftItem(item)
    if (weighed) setSheet(weighed)
    else setWeighing(item)
  }

  const update = useUpdateMeal()
  const remove = useDeleteMeal()

  function beginEditing(from: DayMeal) {
    setName(from.name)
    setTime(from.loggedTime ?? "")
    setItems(from.items.filter((item) => item.name.trim().length > 0).map(draftItemFromLogged))
    setItemsDirty(false)
    update.reset()
    setEditing(true)
  }

  /** Swiped "Edit" on the Nutrition tab: open straight into editing, once. */
  const editOnOpen = useRef(params.edit === "1")
  useEffect(() => {
    if (meal && editOnOpen.current) {
      editOnOpen.current = false
      beginEditing(meal)
    }
  }, [meal])

  if (summary.isPending) {
    return (
      <Frame insetTop={insets.top} title="Meal" onBack={() => router.back()}>
        <Loading label="Loading this meal" />
      </Frame>
    )
  }

  if (summary.isError) {
    return (
      <Frame insetTop={insets.top} title="Meal" onBack={() => router.back()}>
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      </Frame>
    )
  }

  if (!meal) {
    return (
      <Frame insetTop={insets.top} title="Meal" onBack={() => router.back()}>
        <ErrorState error={new ApiError("not-found", "That meal is gone. It may have been deleted.")} />
      </Frame>
    )
  }

  const current: DayMeal = meal

  function startEditing() {
    beginEditing(current)
  }

  function updateItems(next: DraftItem[]) {
    setItems(next)
    setItemsDirty(true)
  }

  const complete = items.filter(isDraftItemComplete)
  const typedTime = time.trim()
  const timeValid = typedTime.length === 0 || normaliseLoggedTime(typedTime) !== null
  const nextTime = typedTime.length === 0 ? null : normaliseLoggedTime(typedTime)

  const patch: PatchMeal = {
    ...(name.trim().length > 0 && name.trim() !== current.name ? { name: name.trim() } : {}),
    ...(timeValid && nextTime !== current.loggedTime ? { loggedTime: nextTime } : {}),
    ...(itemsDirty ? { items: complete.map(toWriteItem), macros: draftTotals(complete) } : {}),
  }
  const changed = Object.keys(patch).length > 0
  const busy = update.isPending || remove.isPending
  const canSave = editing && changed && timeValid && complete.length > 0 && !busy

  function save() {
    if (!canSave) return
    // Back to viewing; the day refetches, so the view shows what was saved.
    update.mutate({ id: current.id, patch }, { onSuccess: () => setEditing(false) })
  }

  function confirmDelete() {
    Alert.alert(`Delete ${current.name}?`, "It comes off this day's log. This can't be undone.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => remove.mutate(current.id, { onSuccess: () => router.back() }),
      },
    ])
  }

  const totals: Macros = editing && itemsDirty ? draftTotals(complete) : current.macros
  const slot = slotOfMeal(current.name, current.loggedTime)
  const isToday = day === currentLoggingDay()
  // No time for now (Sriman, 2026-10-20). It is still stored, and a save
  // leaves it as it was.
  const subtitle = [
    current.name.trim().toLowerCase() === slot.toLowerCase() ? null : slot,
    isToday ? "Today" : formatDayWithWeekday(day),
  ]
    .filter(Boolean)
    .join(" · ")

  const error = update.error
    ? saveErrorMessage(update.error, MEAL_WORDING)
    : remove.error
      ? deleteErrorMessage(remove.error, MEAL_WORDING)
      : null

  return (
    <Frame
      insetTop={insets.top}
      title={editing ? "Edit meal" : "Meal"}
      onDelete={editing ? undefined : confirmDelete}
      deleting={remove.isPending}
      // Back while editing leaves the edit, not the screen: nothing is lost
      // to a reflexive tap on the chevron.
      onBack={() => (editing ? setEditing(false) : router.back())}
    >
      {/* No swipe-back while editing or while the amount panel is up. */}
      <Stack.Screen options={{ gestureEnabled: !editing && sheet === null && weighing === null }} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        // Zero, for the reason `log-weight.tsx` spells out at length.
        keyboardVerticalOffset={0}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-[16px] pb-[32px] pt-[8px]"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {editing ? (
            <View className="flex-row">
              <TextField label="Name" value={name} onChangeText={setName} maxLength={200} />
            </View>
          ) : (
            <View>
              <Text className="font-display text-[30px] leading-[34px] text-white">{current.name}</Text>
              <Text className="mt-[2px] font-barlow text-[14px] text-textSecondary">{subtitle}</Text>
            </View>
          )}
          {editing && !timeValid ? (
            <Text className="mt-[6px] font-barlow text-[13px] text-danger">
              Time is 24-hour, like 07:30 or 18:45. Leave it empty for no time.
            </Text>
          ) : null}

          <TotalsCard macros={totals} />

          <Text className="mt-[22px] font-barlow-bold text-[17px] text-white">
            Ingredients
            <Text className="font-barlow text-[14px] text-textSecondary">
              {"  "}
              {editing ? items.length : current.items.length}
            </Text>
          </Text>

          <View className="mt-[8px] rounded-[16px] bg-card px-[14px]">
            {editing
              ? items.map((item, index) => (
                  <View
                    key={item.key}
                    className={`flex-row items-center ${index > 0 ? "border-t border-hairline" : ""}`}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}, ${draftItemQty(item)}. Change it or remove it.`}
                      onPress={() => openLine(item)}
                      className="flex-1 active:opacity-70"
                    >
                      <IngredientLine name={item.name} qty={draftQtyLabel(item)} macros={draftItemMacros(item)} />
                    </Pressable>
                  </View>
                ))
              : current.items
                  .filter((item) => item.name.trim().length > 0)
                  .map((item, index) => (
                    <View key={`${item.name}-${index}`} className={index > 0 ? "border-t border-hairline" : ""}>
                      <IngredientLine name={item.name} qty={storedItemQty(item)} macros={item.macros} />
                    </View>
                  ))}
            {(editing ? items.length : current.items.length) === 0 ? (
              <Text className="py-[16px] font-barlow text-[14px] text-textSecondary">
                {editing ? "Every ingredient is removed. Add one back with Cancel, or delete the meal." : "No ingredients recorded."}
              </Text>
            ) : null}
          </View>

          {editing ? (
            <>
              <Text className="mt-[10px] font-barlow text-[13px] text-textSecondary">
                Tap an ingredient to change it or remove it. To add one, use the + on the meal card.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete this meal"
                accessibilityState={{ busy: remove.isPending }}
                disabled={busy}
                onPress={confirmDelete}
                className="mt-[24px] h-[48px] items-center justify-center self-center px-[16px] active:opacity-70"
              >
                <Text className="font-barlow-semibold text-[15px] text-danger">
                  {remove.isPending ? "Deleting…" : "Delete this meal"}
                </Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>

        <View
          className="border-t border-hairline bg-ground px-[16px] pt-[12px]"
          style={{ paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12 }}
        >
          {error ? <Text className="mb-[8px] font-barlow text-[13px] text-danger">{error}</Text> : null}
          {editing ? (
            <View className="flex-row gap-[10px]">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel, keep the meal as it was"
                onPress={() => setEditing(false)}
                className="h-[52px] flex-1 items-center justify-center rounded-full border border-buttonBorder bg-secondary active:opacity-80"
              >
                <Text className="font-barlow-semibold text-[16px] text-white">Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save changes to this meal"
                accessibilityState={{ disabled: !canSave, busy: update.isPending }}
                disabled={!canSave}
                onPress={save}
                className={`h-[52px] flex-[2] items-center justify-center rounded-full ${
                  canSave ? "bg-primary active:opacity-80" : "bg-secondary"
                }`}
              >
                <Text className={`font-barlow-semibold text-[16px] ${canSave ? "text-ground" : "text-textSecondary"}`}>
                  {update.isPending ? "Saving…" : "Save changes"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${current.name}`}
              onPress={startEditing}
              className="h-[52px] items-center justify-center rounded-full bg-primary active:opacity-80"
            >
              <Text className="font-barlow-semibold text-[16px] text-ground">Edit meal</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {weighing ? (
        <WeighSheet
          key={weighing.key}
          item={weighing}
          onConfirm={(weighed) => {
            setWeighing(null)
            setSheet(weighed)
          }}
          onRemove={() => {
            updateItems(items.filter((row) => row.key !== weighing.key))
            setWeighing(null)
          }}
          onClose={() => setWeighing(null)}
        />
      ) : sheet ? (
        <ServingSheet
          key={sheet.key}
          item={sheet}
          confirmLabel="Update"
          onConfirm={(next) => {
            updateItems(items.map((row) => (row.key === next.key ? next : row)))
            setSheet(null)
          }}
          onRemove={() => {
            updateItems(items.filter((row) => row.key !== sheet.key))
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </Frame>
  )
}

/**
 * The header that is there in every state, so loading or failing never leaves
 * a screen with no way back. Same reasoning as `saved-meal.tsx`'s `Frame`.
 */
function Frame({
  insetTop,
  title,
  onBack,
  onDelete,
  deleting,
  children,
}: {
  insetTop: number
  title: string
  onBack: () => void
  onDelete?: (() => void) | undefined
  deleting?: boolean
  children: React.ReactNode
}) {
  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insetTop }}>
      <View className="h-[56px] flex-row items-center px-[6px]">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text className="ml-[2px] font-barlow-semibold text-[18px] text-white">{title}</Text>
        <View className="flex-1" />
        {onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete this meal"
            accessibilityState={{ busy: deleting }}
            disabled={deleting}
            onPress={onDelete}
            className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
          >
            <TrashIcon size={20} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  )
}
