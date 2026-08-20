import { useEffect, useMemo, useRef, useState } from "react"
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { currentLoggingDay, isLogDay, type LogDay } from "@engine"
import type { PatchMeal, WriteMeal } from "@shared"

import { ChevronLeft, PlusIcon, TrashIcon } from "@/components/icons/UiIcons"
import { DayStepper } from "@/components/logging/DayStepper"
import { TextField } from "@/components/logging/fields"
import { MealItemRow } from "@/components/logging/MealItemRow"
import { ErrorState, Loading } from "@/components/state"
import { colors } from "@/design/tokens"
import { ApiError } from "@/lib/api"
import { formatGrams, formatKcal } from "@/lib/format"
import { MEAL_WORDING, saveErrorMessage } from "@/lib/save-message"
import {
  currentClockTime,
  draftFromMeal,
  draftItemMacros,
  draftTotals,
  emptyDraftItem,
  isDraftItemComplete,
  normaliseLoggedTime,
  toWriteItem,
  type DraftItem,
} from "@/lib/meal-draft"
import { useDaySummary, useDeleteMeal, useLogMeal, useUpdateMeal } from "@/lib/queries"
import { useDebouncedValue } from "@/lib/use-debounced-value"
import { useKeyboardVisible } from "@/lib/use-keyboard-visible"
import { uuidv7 } from "@/lib/uuid"

/**
 * The manual entry form — plan.md calls it "the speed-critical surface".
 *
 * One screen does both jobs. `?id=` opens an existing meal for correction and
 * `PATCH /meal-logs/:id` saves it; without one it is a new meal and `POST
 * /meal-logs` saves it. They were nearly two screens, and every field, every
 * unit rule and every four-state branch would have existed twice — with the
 * edit copy the one nobody re-checks.
 *
 * ## Four states, on a form
 *
 * The standing rule applies here in a way it does not on a card. **Loading** and
 * **error** belong to fetching the meal being edited — a new meal has nothing to
 * load and goes straight to the form. **Empty** is the form itself with one
 * blank line in it, which is the correct and expected starting state rather
 * than a message about nothingness. And the *save* has its own three: pending
 * disables the button and says so, failure prints the reason above it, success
 * leaves the screen.
 *
 * ## Nothing here multiplies or adds
 *
 * Every figure on this screen comes from `@/lib/meal-draft`, which calls the
 * engine. The screen owns text, layout and which button is disabled.
 */
export default function LogMeal() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ date?: string; id?: string }>()
  const keyboardVisible = useKeyboardVisible()

  const editingId = typeof params.id === "string" && params.id.length > 0 ? params.id : null

  /**
   * The day being written to.
   *
   * Seeded from the route so that "add a meal" from a back-dated day view lands
   * on that day, and validated rather than trusted — a hand-typed deep link is
   * the one path that reaches this with rubbish in it, and `currentLoggingDay()`
   * is the right answer to rubbish.
   */
  const [day, setDay] = useState<LogDay>(() =>
    typeof params.date === "string" && isLogDay(params.date)
      ? params.date
      : currentLoggingDay(),
  )

  /**
   * The day the meal is stored on, which is **not** `day` once it has been
   * stepped. Held separately so the patch can tell "the user moved this meal"
   * from "the user opened it on the day it already lives on".
   */
  const [originalDay] = useState(day)

  const summary = useDaySummary(originalDay)
  const meal = editingId ? summary.data?.meals.find((row) => row.id === editingId) : undefined

  const [name, setName] = useState("")
  const [loggedTime, setLoggedTime] = useState(currentClockTime)
  const [items, setItems] = useState<DraftItem[]>(() => [emptyDraftItem()])
  /** True once the form has been filled from a loaded meal, so it happens once. */
  const loaded = useRef(false)

  useEffect(() => {
    if (!editingId || loaded.current || !meal) return
    const draft = draftFromMeal(meal)
    setName(draft.name)
    setLoggedTime(draft.loggedTime)
    // A stored meal with no items — possible on the migrated history — still
    // needs a line to type into, or the form opens with nothing to edit.
    setItems(draft.items.length > 0 ? draft.items : [emptyDraftItem()])
    loaded.current = true
  }, [editingId, meal])

  /**
   * The draft the engine sees, 300ms behind the keyboard.
   *
   * plan.md: "Gram inputs debounced at 300ms". The fields above are not
   * debounced and must not be — see `use-debounced-value.ts`. This is what
   * stops the per-item totals and the meal total flickering through 3, 52 and
   * 525 while someone types "150".
   */
  const settledItems = useDebouncedValue(items)
  const totals = useMemo(() => draftTotals(settledItems), [settledItems])
  const itemMacros = useMemo(() => settledItems.map(draftItemMacros), [settledItems])

  const logMeal = useLogMeal()
  const updateMeal = useUpdateMeal()
  const deleteMeal = useDeleteMeal()
  const saving = logMeal.isPending || updateMeal.isPending
  const saveError = logMeal.error ?? updateMeal.error ?? deleteMeal.error

  /**
   * The id this save is using, held across attempts.
   *
   * The whole idempotency contract in one ref: a save whose response was lost
   * must be retried with the **same** id, so the server can answer "already
   * logged" instead of logging the meal twice. Minted on the first attempt and
   * kept until either the save succeeds or the server says the id is taken —
   * which is the one case where a fresh one is correct.
   */
  const pendingId = useRef<string | null>(null)
  useEffect(() => {
    if (logMeal.error?.code === "conflict") pendingId.current = null
  }, [logMeal.error])

  const completeItems = items.filter(isDraftItemComplete)
  const canSave = name.trim().length > 0 && completeItems.length > 0 && !saving

  function updateItem(index: number, next: DraftItem) {
    setItems((current) => current.map((item, i) => (i === index ? next : item)))
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, i) => i !== index))
  }

  function save() {
    if (!canSave) return

    /**
     * Only the named lines are written. A blank row left at the bottom is the
     * normal way to finish typing — you tap "Add another item", think better of
     * it, and hit save — and storing it would leave a nameless entry in the day
     * view that nothing can explain.
     *
     * The header totals are recomputed from *those* lines rather than reusing
     * `totals`, which includes the blank one. It contributes zeros, so the two
     * agree today; they would stop agreeing the moment an incomplete line could
     * carry a number, and a header that disagrees with its items is the exact
     * thing the write contract warns is unverifiable server-side.
     */
    const writeItems = completeItems.map(toWriteItem)
    const headerMacros = draftTotals(completeItems)

    if (editingId) {
      const patch: PatchMeal = {
        name: name.trim(),
        macros: headerMacros,
        items: writeItems,
        loggedTime: normaliseLoggedTime(loggedTime),
        // Sent only when it actually moved. An unchanged date would be a no-op
        // server-side, but it would also be bounds-checked — and a meal older
        // than the back-date window would then fail to save for a day nobody
        // touched.
        ...(day !== originalDay ? { date: day } : {}),
      }
      updateMeal.mutate({ id: editingId, patch }, { onSuccess: () => router.back() })
      return
    }

    pendingId.current ??= uuidv7()

    /**
     * `date` is sent **only when this is a back-date**, never for today.
     *
     * `writeMealSchema` spells out why: "Omitting it means today, and the server
     * answers that with `currentLoggingDay()` … a client that fills in its own
     * date is a second time authority, running on a phone whose clock and
     * timezone this server does not control. At 00:40 SAST the two answers
     * differ by a whole day."
     *
     * The first version sent `date: day` unconditionally, which made the phone
     * the authority on every single meal — caught by review, 2026-08-20. The
     * comparison below is against a **fresh** `currentLoggingDay()` rather than
     * the one `day` was seeded with, so a form left open across midnight
     * correctly sends yesterday's date as the back-date it now is.
     */
    const isBackDate = day !== currentLoggingDay()

    const input: WriteMeal = {
      id: pendingId.current,
      ...(isBackDate ? { date: day } : {}),
      name: name.trim(),
      macros: headerMacros,
      items: writeItems,
      loggedTime: normaliseLoggedTime(loggedTime),
    }
    logMeal.mutate(input, { onSuccess: () => router.back() })
  }

  function confirmDelete() {
    if (!editingId) return
    Alert.alert("Delete this meal?", "It will be removed from this day.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteMeal.mutate(editingId, { onSuccess: () => router.back() }),
      },
    ])
  }

  // ── The two states that belong to loading an existing meal ────────────────
  if (editingId && summary.isPending) {
    return (
      <Screen insetTop={insets.top} onBack={() => router.back()} title="Edit meal">
        <View className="h-[240px]">
          <Loading label="Loading this meal" />
        </View>
      </Screen>
    )
  }

  if (editingId && summary.isError) {
    return (
      <Screen insetTop={insets.top} onBack={() => router.back()} title="Edit meal">
        <View className="h-[240px]">
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        </View>
      </Screen>
    )
  }

  if (editingId && !meal && !loaded.current) {
    return (
      <Screen insetTop={insets.top} onBack={() => router.back()} title="Edit meal">
        <View className="h-[240px]">
          <ErrorState
            error={new ApiError("not-found", "That meal is no longer on this day.")}
          />
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      insetTop={insets.top}
      onBack={() => router.back()}
      title={editingId ? "Edit meal" : "Log a meal"}
      onDelete={editingId ? confirmDelete : undefined}
      deleting={deleteMeal.isPending}
    >
      <KeyboardAvoidingView
        className="flex-1"
        // iOS pushes the whole view; Android's window already resizes, and
        // doubling that up leaves a gap the height of the keyboard.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        /**
         * Zero, and it has to be zero.
         *
         * `keyboardVerticalOffset` is **subtracted from the keyboard's screen
         * Y** inside `KeyboardAvoidingView`, so a positive value makes the
         * padding *larger*, not smaller. It exists for the case where something
         * outside this view — a native navigation header — sits between the
         * view's own coordinate space and the screen.
         *
         * Nothing does here. This view is laid out inside a parent that already
         * carries `paddingTop: insets.top`, and RN's `onLayout` frame includes
         * that padding and the 56pt header above it — so `frame.y + frame.height`
         * already reaches the bottom of the screen and the keyboard height comes
         * out exactly right on its own.
         *
         * The first version passed `insets.top + 56`, on the assumption that the
         * offset compensated for the header. It does the opposite: it added
         * ~115pt of padding on top of the keyboard, which rendered as a band of
         * app-ground colour between the Save bar and the keyboard — about a
         * quarter of the screen, and indistinguishable from a layout crash.
         * Seen on the iPhone 15, 2026-08-20.
         */
        keyboardVerticalOffset={0}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-[16px]">
            <DayStepper day={day} onChange={setDay} />
          </View>

          <View className="mt-[16px] flex-row gap-[10px] px-[16px]">
            <TextField
              label="Meal"
              value={name}
              onChangeText={setName}
              placeholder="Breakfast"
              autoFocus={!editingId}
              maxLength={200}
            />
            <View className="w-[104px]">
              <TextField
                label="Time"
                value={loggedTime}
                onChangeText={setLoggedTime}
                placeholder="08:15"
                accessibilityLabel="Time of day, 24 hour"
                maxLength={5}
              />
            </View>
          </View>

          <View className="mt-[18px] gap-[12px] px-[16px]">
            {items.map((item, index) => (
              <MealItemRow
                key={item.key}
                item={item}
                // Falls back to the item's own computed macros for the frame
                // before the debounce catches up on a newly added line.
                macros={itemMacros[index] ?? draftItemMacros(item)}
                index={index}
                onChange={(next) => updateItem(index, next)}
                onRemove={() => removeItem(index)}
                removable={items.length > 1}
              />
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add another item"
            onPress={() => setItems((current) => [...current, emptyDraftItem()])}
            className="mx-[16px] mt-[12px] h-[44px] flex-row items-center justify-center rounded-[12px] border border-buttonBorder bg-secondary active:opacity-80"
          >
            <PlusIcon size={18} />
            <Text className="ml-[8px] font-barlow-semibold text-[15px] text-white">
              Add another item
            </Text>
          </Pressable>
        </ScrollView>

        {/*
          The total and the save button, pinned. The whole point of this screen
          is a log finished in under ten seconds, and a save button you have to
          scroll a five-item meal to reach is the single biggest thing standing
          between the form and that number.
        */}
        <View
          className="absolute inset-x-0 bottom-0 border-t border-cardBorder bg-card px-[16px] pt-[12px]"
          /*
            The home-indicator inset is dropped while the keyboard is up — the
            keyboard is covering the indicator, so reserving space for it leaves
            the bar floating on a strip of ground colour above the keys.
          */
          style={{ paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12 }}
        >
          {saveError ? (
            <Text className="mb-[10px] font-barlow text-[13px] text-danger">
              {saveErrorMessage(saveError, MEAL_WORDING)}
            </Text>
          ) : null}

          <View className="flex-row items-center">
            <View className="flex-1">
              <Text className="font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-textSecondary">
                Meal total
              </Text>
              <View className="mt-[2px] flex-row items-baseline">
                <Text className="font-barlow-bold text-[20px] text-white">
                  {formatKcal(totals.kcal)}
                </Text>
                <Text className="ml-[4px] font-barlow text-[13px] text-textSecondary">
                  kcal
                </Text>
                <Text className="ml-[10px] font-barlow text-[13px] text-protein">
                  P {formatGrams(totals.protein)}
                </Text>
                <Text className="ml-[8px] font-barlow text-[13px] text-carbs">
                  C {formatGrams(totals.carbs)}
                </Text>
                <Text className="ml-[8px] font-barlow text-[13px] text-fats">
                  F {formatGrams(totals.fat)}
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={editingId ? "Save changes" : "Save this meal"}
              accessibilityState={{ disabled: !canSave, busy: saving }}
              disabled={!canSave}
              onPress={save}
              className={`ml-[12px] h-[48px] items-center justify-center rounded-[12px] px-[24px] ${
                canSave ? "bg-primary active:opacity-80" : "bg-secondary"
              }`}
            >
              <Text
                className={`font-barlow-semibold text-[16px] ${
                  canSave ? "text-white" : "text-textSecondary"
                }`}
              >
                {saving ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

/**
 * The screen frame: a header that is always there, whatever state the body is
 * in. Hoisted so the loading and error branches above cannot accidentally
 * render without a way back — a spinner on a screen with no back button is a
 * trap, and it is the kind of trap that only appears when the network is
 * already misbehaving.
 */
function Screen({
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
          accessibilityLabel="Close"
          onPress={onBack}
          className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={20} color={colors.textSecondary} />
        </Pressable>

        <Text className="ml-[2px] font-barlow-semibold text-[18px] text-white">
          {title}
        </Text>

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
