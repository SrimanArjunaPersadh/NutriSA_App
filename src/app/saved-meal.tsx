import { useEffect, useRef, useState } from "react"
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { currentClockTime, currentLoggingDay, isLogDay, MEAL_SLOTS, type LogDay, type MealSlot } from "@engine"
import type { PatchSavedMeal, SavedMeal, WriteMeal } from "@shared"

import { IngredientLine, TotalsCard } from "@/components/food/MealBreakdown"
import { ServingSheet } from "@/components/food/ServingSheet"
import { WeighSheet } from "@/components/food/WeighSheet"
import { ChevronLeft, TrashIcon } from "@/components/icons/UiIcons"
import { TextField } from "@/components/logging/fields"
import { ErrorState, Loading } from "@/components/state"
import { colors } from "@/design/tokens"
import { ApiError } from "@/lib/api"
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
  toWriteItem,
  writeItemFromLogged,
  type DraftItem,
} from "@/lib/meal-draft"
import { useDeleteSavedMeal, useLogMeal, useSavedMeals, useUpdateSavedMeal } from "@/lib/queries"
import {
  deleteErrorMessage,
  MEAL_WORDING,
  SAVED_MEAL_WORDING,
  saveErrorMessage,
} from "@/lib/save-message"
import { usePlate } from "@/lib/plate"
import { useKeyboardVisible } from "@/lib/use-keyboard-visible"
import { uuidv7 } from "@/lib/uuid"

/**
 * One saved meal: see it, log it, and — only when asked — change it. plan.md
 * Phase 6's "log a saved meal to today in one or two taps" and "edit / delete
 * a saved meal".
 *
 * ## View first, edit on request (2026-10-20)
 *
 * The same pattern as a logged meal (`meal.tsx`), and for the same reason: it
 * opened straight into Name / Category / Note fields over a list of lines, and
 * Sriman wanted to see what is in a meal before being handed a form. The view
 * pieces are shared (`MealBreakdown`), so a saved meal and a meal logged from
 * it read the same.
 *
 * - **View**: the name, its category and note, the totals card, every
 *   ingredient with its amount and macros. **Log to today** is the main button,
 *   because logging is what a saved meal is for; **Edit** sits beside it, and
 *   the trash is in the header.
 * - **Edit**: name, category and note fields; each ingredient opens the amount
 *   panel (`ServingSheet`) with Remove, in grams. A line saved without a real
 *   weight is weighed once first (`WeighSheet`). **Save changes** or **Cancel**, **Delete** at the foot.
 *
 * From the library list a row also swipes left for Edit and Delete
 * (`SwipeActions`); Edit lands here with `edit=1`, already editing.
 *
 * **Log to today** writes the meal as saved through the ordinary `POST
 * /meal-logs`, with `lib_id` pointing back here.
 *
 * ## Opened from the logger: it goes to the meal being filled
 *
 * The logger passes `slot` (and `date`) when a saved meal's card is tapped.
 * Then the button reads **Add to Breakfast** and the meal is logged **as**
 * Breakfast, on the logger's day, and the app returns to the Nutrition tab
 * where it now sits under that card. Without this, a saved meal opened from
 * Breakfast's `+` was logged under its own name, which the day view files by
 * the clock, so at 15:00 it landed in Snack (iPhone, 2026-10-20, "English
 * breaky" and "Yum of Vegan Pasta"). Opened from the library there is no slot,
 * and it logs to today under its own name as before.
 *
 * ## The header stays authoritative until the lines change
 *
 * A rename, a category or a note sends neither `items` nor `macros` — the
 * stored header is left exactly as it was. Only when a line is changed or
 * removed are the lines rewritten, and then the header is recomputed by the
 * engine from the lines being written. The 4 migrated saved meals carry headers
 * their lines do not necessarily sum to, and renaming one must not quietly move
 * its calories.
 *
 * ## Four states
 *
 * Loading and error belong to the library list this is read out of; a meal
 * that is not in it (deleted on another screen) gets its own not-found. The
 * writes each have their own pending and failure line.
 */
export default function SavedMealScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const keyboardVisible = useKeyboardVisible()
  const params = useLocalSearchParams<{ id?: string; edit?: string; slot?: string; date?: string }>()
  /** The meal the logger is filling, when it opened this. Validated, never trusted. */
  const slot: MealSlot | null =
    typeof params.slot === "string" && (MEAL_SLOTS as readonly string[]).includes(params.slot)
      ? (params.slot as MealSlot)
      : null
  const [day] = useState<LogDay>(() =>
    typeof params.date === "string" && isLogDay(params.date) ? params.date : currentLoggingDay(),
  )
  const plate = usePlate()

  const library = useSavedMeals()
  const meal = library.data?.meals.find((row) => row.id === params.id)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [note, setNote] = useState("")
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

  const update = useUpdateSavedMeal()
  const remove = useDeleteSavedMeal()
  const logMeal = useLogMeal()
  /** The log's idempotency key, held across attempts. See `add-food.tsx`'s `pendingId`. */
  const pendingLogId = useRef<string | null>(null)
  useEffect(() => {
    if (logMeal.error?.code === "conflict") pendingLogId.current = null
  }, [logMeal.error])

  function beginEditing(from: SavedMeal) {
    setName(from.name)
    setCategory(from.category ?? "")
    setNote(from.note ?? "")
    setItems(from.items.filter((item) => item.name.trim().length > 0).map(draftItemFromLogged))
    setItemsDirty(false)
    update.reset()
    setEditing(true)
  }

  /** Swiped "Edit" in the library: open straight into editing, once. */
  const editOnOpen = useRef(params.edit === "1")
  useEffect(() => {
    if (meal && editOnOpen.current) {
      editOnOpen.current = false
      beginEditing(meal)
    }
  }, [meal])

  if (library.isPending) {
    return (
      <Frame insetTop={insets.top} title="Saved meal" onBack={() => router.back()}>
        <Loading label="Loading this meal" />
      </Frame>
    )
  }

  if (library.isError) {
    return (
      <Frame insetTop={insets.top} title="Saved meal" onBack={() => router.back()}>
        <ErrorState error={library.error} onRetry={() => void library.refetch()} />
      </Frame>
    )
  }

  if (!meal) {
    return (
      <Frame insetTop={insets.top} title="Saved meal" onBack={() => router.back()}>
        <ErrorState error={new ApiError("not-found", "That saved meal is gone.")} />
      </Frame>
    )
  }

  const current: SavedMeal = meal

  function updateItems(next: DraftItem[]) {
    setItems(next)
    setItemsDirty(true)
  }

  const complete = items.filter(isDraftItemComplete)
  const patch: PatchSavedMeal = {
    ...(name.trim() !== current.name && name.trim().length > 0 ? { name: name.trim() } : {}),
    ...((category.trim() || null) !== current.category ? { category: category.trim() || null } : {}),
    ...((note.trim() || null) !== current.note ? { note: note.trim() || null } : {}),
    ...(itemsDirty ? { items: complete.map(toWriteItem), macros: draftTotals(complete) } : {}),
  }
  const changed = Object.keys(patch).length > 0
  const busy = update.isPending || logMeal.isPending || remove.isPending
  const canSave = editing && changed && complete.length > 0 && !busy
  const loggable = current.items.filter((item) => item.name.trim().length > 0)
  const canLog = loggable.length > 0 && !busy

  function save() {
    if (!canSave) return
    // Back to viewing; the library refetches, so the view shows what was saved.
    update.mutate({ id: current.id, patch }, { onSuccess: () => setEditing(false) })
  }

  /**
   * Logs the meal **as saved**, never a half-made edit: into the logger's slot
   * and day when the logger opened this, else to today under its own name.
   */
  function logToday() {
    if (!canLog) return
    pendingLogId.current ??= uuidv7()
    // Back-dates only, never today: the server is the time authority.
    const isBackDate = slot !== null && day !== currentLoggingDay()

    const input: WriteMeal = {
      id: pendingLogId.current,
      ...(isBackDate ? { date: day } : {}),
      name: slot ?? current.name,
      macros: current.macros,
      items: loggable.map(writeItemFromLogged),
      loggedTime: currentClockTime(),
      libId: current.id,
    }

    logMeal.mutate(input, {
      onSuccess: () => {
        pendingLogId.current = null
        // From the logger with nothing else on the plate: straight back to
        // the day, where the meal now shows under its card. With food still on
        // the plate, back to the logger so it is not left behind.
        if (slot !== null && plate.length === 0) router.dismiss(2)
        else router.back()
      },
    })
  }

  function confirmDelete() {
    Alert.alert(`Delete ${current.name}?`, "It leaves your saved meals. Meals already logged from it stay logged.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => remove.mutate(current.id, { onSuccess: () => router.back() }),
      },
    ])
  }

  const totals = editing && itemsDirty ? draftTotals(complete) : current.macros
  const subtitle = [current.category, `${loggable.length} ${loggable.length === 1 ? "ingredient" : "ingredients"}`]
    .filter(Boolean)
    .join(" · ")

  const error = logMeal.error
    ? saveErrorMessage(logMeal.error, MEAL_WORDING)
    : update.error
      ? saveErrorMessage(update.error, SAVED_MEAL_WORDING)
      : remove.error
        ? deleteErrorMessage(remove.error, SAVED_MEAL_WORDING)
        : null

  return (
    <Frame
      insetTop={insets.top}
      title={editing ? "Edit saved meal" : "Saved meal"}
      // Back while editing leaves the edit, not the screen.
      onBack={() => (editing ? setEditing(false) : router.back())}
      onDelete={editing ? undefined : confirmDelete}
      deleting={remove.isPending}
    >
      {/* No swipe-back while editing or while a panel is up. */}
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
            <>
              <View className="flex-row">
                <TextField label="Name" value={name} onChangeText={setName} maxLength={200} />
              </View>
              <View className="mt-[12px] flex-row gap-[10px]">
                <TextField
                  label="Category"
                  value={category}
                  onChangeText={setCategory}
                  placeholder="Breakfast"
                  maxLength={40}
                />
              </View>
              <View className="mt-[12px] flex-row">
                <TextField label="Note" value={note} onChangeText={setNote} placeholder="Optional" maxLength={500} />
              </View>
            </>
          ) : (
            <View>
              <Text className="font-display text-[30px] leading-[34px] text-white">{current.name}</Text>
              <Text className="mt-[2px] font-barlow text-[14px] text-textSecondary">{subtitle}</Text>
              {current.note ? (
                <Text className="mt-[8px] font-barlow text-[15px] leading-[21px] text-white">{current.note}</Text>
              ) : null}
            </View>
          )}

          <TotalsCard macros={totals} />

          <Text className="mt-[22px] font-barlow-bold text-[17px] text-white">
            Ingredients
            <Text className="font-barlow text-[14px] text-textSecondary">
              {"  "}
              {editing ? items.length : loggable.length}
            </Text>
          </Text>

          <View className="mt-[8px] rounded-[16px] bg-card px-[14px]">
            {editing
              ? items.map((item, index) => (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}, ${draftItemQty(item)}. Change it or remove it.`}
                    onPress={() => openLine(item)}
                    className={`active:opacity-70 ${index > 0 ? "border-t border-hairline" : ""}`}
                  >
                    <IngredientLine name={item.name} qty={draftQtyLabel(item)} macros={draftItemMacros(item)} />
                  </Pressable>
                ))
              : loggable.map((item, index) => (
                  <View key={`${item.name}-${index}`} className={index > 0 ? "border-t border-hairline" : ""}>
                    <IngredientLine name={item.name} qty={storedItemQty(item)} macros={item.macros} />
                  </View>
                ))}
            {(editing ? items.length : loggable.length) === 0 ? (
              <Text className="py-[16px] font-barlow text-[14px] text-textSecondary">
                {editing ? "Every ingredient is removed. Cancel to get them back, or delete the meal." : "No ingredients recorded."}
              </Text>
            ) : null}
          </View>

          {editing ? (
            <>
              <Text className="mt-[10px] font-barlow text-[13px] text-textSecondary">
                Tap an ingredient to change it or remove it.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete this saved meal"
                accessibilityState={{ busy: remove.isPending }}
                disabled={busy}
                onPress={confirmDelete}
                className="mt-[24px] h-[48px] items-center justify-center self-center px-[16px] active:opacity-70"
              >
                <Text className="font-barlow-semibold text-[15px] text-danger">
                  {remove.isPending ? "Deleting…" : "Delete this saved meal"}
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
                accessibilityLabel="Cancel, keep the saved meal as it was"
                onPress={() => setEditing(false)}
                className="h-[52px] flex-1 items-center justify-center rounded-full border border-buttonBorder bg-secondary active:opacity-80"
              >
                <Text className="font-barlow-semibold text-[16px] text-white">Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save changes to this saved meal"
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
            <View className="flex-row gap-[10px]">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${current.name}`}
                onPress={() => beginEditing(current)}
                className="h-[52px] flex-1 items-center justify-center rounded-full border border-buttonBorder bg-secondary active:opacity-80"
              >
                <Text className="font-barlow-semibold text-[16px] text-white">Edit</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={slot ? `Add ${current.name} to ${slot}` : `Log ${current.name} to today`}
                accessibilityState={{ disabled: !canLog, busy: logMeal.isPending }}
                disabled={!canLog}
                onPress={logToday}
                className={`h-[52px] flex-[2] items-center justify-center rounded-full ${
                  canLog ? "bg-primary active:opacity-80" : "bg-secondary"
                }`}
              >
                <Text className={`font-barlow-semibold text-[16px] ${canLog ? "text-ground" : "text-textSecondary"}`}>
                  {logMeal.isPending ? "Logging…" : slot ? `Add to ${slot}` : "Log to today"}
                </Text>
              </Pressable>
            </View>
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
 * a screen with no way back.
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
            accessibilityLabel="Delete this saved meal"
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
