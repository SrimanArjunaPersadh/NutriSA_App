import { useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import {
  currentClockTime,
  currentLoggingDay,
  isLogDay,
  MEAL_SLOTS,
  mealNameFor,
  type LogDay,
  type Macros,
  type MealSlot,
} from "@engine"
import type { Food, FoodSearch, OffStatus, SavedMeal, WriteMeal } from "@shared"

import { BarcodeScanner } from "@/components/food/BarcodeScanner"
import { FoodRow, MacroCompact, servingText } from "@/components/food/FoodRow"
import { AddedToast, type Toast } from "@/components/food/AddedToast"
import { PlateSheet } from "@/components/food/PlateSheet"
import { QuickAddPanel } from "@/components/food/QuickAddPanel"
import { SavedMealStrip } from "@/components/food/SavedMealCards"
import { ServingSheet } from "@/components/food/ServingSheet"
import { SlotSheet } from "@/components/food/SlotSheet"
import {
  BarcodeIcon,
  ChevronDown,
  CloseIcon,
  FlameIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/icons/UiIcons"
import { Empty, ErrorState, Loading } from "@/components/state"
import { colors } from "@/design/tokens"
import { formatDayWithWeekday, formatKcal } from "@/lib/format"
import {
  draftItemFromFood,
  draftItemFromLogged,
  draftItemMacros,
  draftTotals,
  isDraftItemComplete,
  toWriteItem,
  type DraftItem,
} from "@/lib/meal-draft"
import { addToPlate, clearPlate, plateMealId, removeFromPlate, updatePlateItem, usePlate } from "@/lib/plate"
import {
  useCreateSavedMeal,
  useDaySummary,
  useFoodSearch,
  useLocalFoodSearch,
  useLogMeal,
  useRecentFoods,
  useSavedMeals,
} from "@/lib/queries"
import { MEAL_WORDING, SAVED_MEAL_WORDING, saveErrorMessage } from "@/lib/save-message"
import { useDebouncedValue } from "@/lib/use-debounced-value"
import { useKeyboardVisible } from "@/lib/use-keyboard-visible"
import { uuidv7 } from "@/lib/uuid"

/**
 * The food logger, rebuilt 2026-10-20 from the research in `research designs/`
 * (the clickable mockup is `research designs/prototype.html`). The plate model
 * is MacroFactor's and stays: foods go onto a plate, and the plate is logged as
 * one meal.
 *
 * ## What the screen is, top to bottom
 *
 * - **"Breakfast ▾"** — the meal being filled, as the title, with the day under
 *   it if it is not today. Tapping it opens `SlotSheet`. FatSecret and
 *   MyFitnessPal both carry the meal this way. It replaced a row of four meal
 *   chips under the search field that the iPhone showed was crowding it. The
 *   meal usually arrives already chosen: each meal card on the Nutrition tab
 *   has its own `+`, which opens this screen with `slot=`. Without one, the
 *   clock picks (`mealNameFor`), in plain sight in the title.
 * - **The search field.**
 * - **Scan · Quick add · New food** — the other ways to get food onto the plate,
 *   in one row (MacroFactor's mode row, FatSecret's bottom bar). Hidden while
 *   typing, because then the results are the point.
 * - **With nothing typed:** "Usually at breakfast", the foods eaten at this
 *   meal most often first (`GET /foods/recent?slot=`, MacroFactor's "3 PM
 *   Picks"), then Saved meals.
 * - **With a query:** "Your foods" first, marked, then "All foods" (MyNetDiary).
 *   The server already orders them; this screen only draws the split.
 * - **The plate, minified, at the bottom**: "Breakfast · 2 items · 279 kcal",
 *   which opens it, beside a Log button. Only when there is something to log.
 *
 * Every `+` raises a banner, "1 item added to Breakfast", with **Undo**.
 *
 * ## Four states
 *
 * The list and search each own loading, error, empty and happy. The log has its
 * own: pending disables the bar, failure prints the reason above it, success
 * clears the plate and leaves. Saved through the same `POST /meal-logs` as the
 * manual form — one write path, one idempotency contract.
 */

/**
 * Long enough to sit out a word being typed; short enough to feel live. 250,
 * down from 400, with the local half of a search now answering in a few
 * hundred milliseconds (2026-10-20).
 */
const SEARCH_DEBOUNCE_MS = 250

/** What fills the space under the search field. `ai` is reserved for Phase 9. */
type LogMode = "scan" | "search" | "ai" | "quick-add"

const MODES: readonly LogMode[] = ["scan", "search", "ai", "quick-add"]

type Sheet =
  | { kind: "add"; food: Food; item: DraftItem }
  | { kind: "edit"; item: DraftItem }

/** A toast that knows which plate lines it announced, so Undo can take them off. */
type AddToast = Toast & { keys: readonly string[] }

function isMealSlot(value: unknown): value is MealSlot {
  return typeof value === "string" && (MEAL_SLOTS as readonly string[]).includes(value)
}

export default function AddFood() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const keyboardVisible = useKeyboardVisible()
  const params = useLocalSearchParams<{ date?: string; mode?: string; focus?: string; slot?: string; plate?: string }>()

  /** Validated, never trusted: a URL parameter is client input. */
  const [day] = useState<LogDay>(() =>
    typeof params.date === "string" && isLogDay(params.date) ? params.date : currentLoggingDay(),
  )
  const [mode, setMode] = useState<LogMode>(() =>
    MODES.includes(params.mode as LogMode) ? (params.mode as LogMode) : "search",
  )

  /** The meal being filled: the card's `+` that opened this, else the clock. */
  const [slot, setSlot] = useState<MealSlot>(() =>
    isMealSlot(params.slot) ? params.slot : mealNameFor(currentClockTime()),
  )
  const [slotOpen, setSlotOpen] = useState(false)

  const [query, setQuery] = useState("")
  const settledQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const typing = query.trim().length > 0
  const searching = mode === "search" && settledQuery.trim().length > 0

  const plate = usePlate()
  const totals = useMemo(() => draftTotals(plate), [plate])

  const [sheet, setSheet] = useState<Sheet | null>(null)
  /** `?plate=1`: open on the plate, as a meal card's Edit does (Phase 9, A2). */
  const [plateOpen, setPlateOpen] = useState(params.plate === "1")
  const [toast, setToast] = useState<AddToast | null>(null)

  const recent = useRecentFoods(slot)
  const search = useFoodSearch(searching ? settledQuery : "")
  /** The fast half: drawn first, while Open Food Facts is still answering. */
  const localSearch = useLocalFoodSearch(searching ? settledQuery : "")
  const savedMeals = useSavedMeals()
  /** For the food panel's "left today after this". Already cached by the Nutrition tab. */
  const daySummary = useDaySummary(day)

  /**
   * The saved meal this plate **is**, if it is one: set when a saved meal goes
   * onto an empty plate, with its stored header and the plate's lines at that
   * moment. It only counts while the plate still matches (see `asSaved` below):
   * add a food, change an amount or remove a line, and the result is no longer
   * that meal. Found by the Spec axis of `/nutrisa-review`, 2026-10-20: it used
   * to stay set after extras were added, linking a different meal to the saved
   * one.
   */
  const [fromSaved, setFromSaved] = useState<{ id: string; macros: Macros; signature: string } | null>(null)

  const createSaved = useCreateSavedMeal()
  /** Idempotency key for "Save as meal", the same contract as the log. */
  const savedMealId = useRef<string | null>(null)
  /**
   * What this plate was last saved as, and its lines at that moment, so "Saved
   * as ..." only shows while the plate is still the thing that was saved.
   */
  const [saved, setSaved] = useState<{ signature: string; name: string } | null>(null)
  useEffect(() => {
    if (createSaved.error?.code === "conflict") savedMealId.current = null
  }, [createSaved.error])

  const logMeal = useLogMeal()
  /**
   * The id this log is using, held across attempts.
   *
   * The whole idempotency contract in one ref: a save whose response was lost
   * must be retried with the **same** id, so the server can answer "already
   * logged" instead of logging the meal twice. Minted on the first attempt and
   * kept until either the save succeeds or the server says the id is taken —
   * which is the one case where a fresh one is correct. (Moved here from the
   * old meal form, `log-meal.tsx`, when it was deleted.)
   */
  const pendingId = useRef<string | null>(null)
  useEffect(() => {
    if (logMeal.error?.code === "conflict") pendingId.current = null
  }, [logMeal.error])

  const complete = plate.filter(isDraftItemComplete)
  const canLog = complete.length > 0 && !logMeal.isPending
  const saveError = logMeal.error ? saveErrorMessage(logMeal.error, MEAL_WORDING) : null
  const isToday = day === currentLoggingDay()

  /** A new key per banner, so a second `+` restarts its timer. A counter, not the clock. */
  const toastCount = useRef(0)

  /** Lines onto the plate, with the banner saying so. */
  function add(items: readonly DraftItem[], what: string, kcal: number) {
    for (const item of items) addToPlate(item)
    toastCount.current += 1
    setToast({
      key: toastCount.current,
      title: `${items.length} ${items.length === 1 ? "item" : "items"} added to ${slot}`,
      detail: `${what} (${formatKcal(kcal)} cal)`,
      keys: items.map((item) => item.key),
    })
  }

  /** The banner's Undo: the lines it announced come off the plate. */
  function undo() {
    if (!toast) return
    for (const key of toast.keys) removeFromPlate(key)
    setToast(null)
  }

  /**
   * `+` on a row: the remembered serving, onto the plate, and the search box
   * cleared for the next food (MacroFactor's multi-add).
   */
  function addFood(food: Food) {
    const item = draftItemFromFood(food)
    add([item], food.name, draftItemMacros(item).kcal)
    setQuery("")
  }

  function openFood(food: Food) {
    setSheet({ kind: "add", food, item: draftItemFromFood(food) })
  }

  /** A whole saved meal onto the plate — every named line, as it was saved. */
  function addSavedMeal(meal: SavedMeal) {
    const wasEmpty = plate.length === 0
    const lines = meal.items.filter((item) => item.name.trim().length > 0).map(draftItemFromLogged)
    add(lines, meal.name, meal.macros.kcal)
    // The plate stays named for the meal it is being logged to. `lib_id`
    // records where it came from, and the stored header is kept for the log.
    setFromSaved(
      wasEmpty
        ? { id: meal.id, macros: meal.macros, signature: lines.map((item) => `${item.key}:${item.quantity}`).join("|") }
        : null,
    )
  }

  const plateSignature = plate.map((item) => `${item.key}:${item.quantity}`).join("|")
  /** The saved meal this plate still exactly is, or null. */
  const asSaved = fromSaved !== null && fromSaved.signature === plateSignature ? fromSaved : null
  const savedAs = saved !== null && saved.signature === plateSignature ? saved.name : null

  /** Save the plate to the library under a name of its own, never the slot's. */
  function saveAsMeal(name: string) {
    if (complete.length === 0 || createSaved.isPending || name.length === 0) return
    savedMealId.current ??= uuidv7()
    const signature = plateSignature

    createSaved.mutate(
      {
        id: savedMealId.current,
        name,
        macros: draftTotals(complete),
        items: complete.map(toWriteItem),
      },
      {
        onSuccess: () => {
          // A fresh key for the next save: this one is spent on a row now.
          savedMealId.current = null
          setSaved({ signature, name })
        },
      },
    )
  }

  function logPlate() {
    if (!canLog) return
    // A plate loaded from an assistant meal card logs under the card's id, so
    // the card reads Logged and its Confirm cannot log it twice (Phase 9, A2).
    pendingId.current ??= plateMealId() ?? uuidv7()

    // Back-dates only, never today — the server is the time authority. The
    // comparison is against a fresh `currentLoggingDay()`, so a logger left
    // open across midnight still files yesterday's plate under yesterday.
    const isBackDate = day !== currentLoggingDay()

    const input: WriteMeal = {
      id: pendingId.current,
      ...(isBackDate ? { date: day } : {}),
      name: slot,
      // A saved meal logged as it is keeps its **stored** header, the same
      // figure "Log to today" on its own screen writes: the 4 migrated saved
      // meals have headers their lines do not sum to, and the two paths used
      // to log different calories for the same meal (Spec axis, 2026-10-20).
      // Anything else is recomputed from the lines being written, so the
      // header can never disagree with its items.
      macros: asSaved ? asSaved.macros : draftTotals(complete),
      items: complete.map(toWriteItem),
      loggedTime: currentClockTime(),
      ...(asSaved ? { libId: asSaved.id } : {}),
    }

    logMeal.mutate(input, {
      onSuccess: () => {
        pendingId.current = null
        clearPlate()
        router.back()
      },
    })
  }

  function editLine(item: DraftItem) {
    // A `direct` line has no amount to edit — it is absolute macros, corrected
    // by removing and re-adding.
    if (item.mode !== "portion") return
    setPlateOpen(false)
    setSheet({ kind: "edit", item })
  }

  /** Scan and Quick add are toggles: tapping the one that is open goes back to the list. */
  function toggleMode(next: "scan" | "quick-add") {
    setMode(mode === next ? "search" : next)
  }

  /**
   * What the food panel needs for "left today after this": the day so far, its
   * targets, and the rest of the plate (without the line being edited). Null
   * until the day has loaded, and on a day with no targets.
   */
  function budgetFor(current: Sheet) {
    const summary = daySummary.data
    if (!summary?.targets) return null
    const others = current.kind === "edit" ? plate.filter((line) => line.key !== current.item.key) : plate
    return { consumed: summary.consumed, targets: summary.targets, others: draftTotals(others), today: isToday }
  }

  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
      {/*
        No swipe-back at all while a sheet is up. An edge swipe that starts on
        the sheet would otherwise pop the whole logger out from under it, and
        take the plate's context with it.
      */}
      <Stack.Screen options={{ gestureEnabled: sheet === null && !plateOpen && !slotOpen }} />

      {/* ── Header: close, and the meal as the title ──────────────────── */}
      <View className="h-[56px] flex-row items-center px-[6px]">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the food logger"
          onPress={() => router.back()}
          className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
        >
          <CloseIcon size={18} />
        </Pressable>

        <View className="flex-1 items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Adding to ${slot}${isToday ? "" : `, ${formatDayWithWeekday(day)}`}. Change the meal.`}
            onPress={() => setSlotOpen(true)}
            className="min-h-[44px] items-center justify-center rounded-full px-[14px] active:bg-secondary"
          >
            <View className="flex-row items-center">
              <Text className="font-barlow-semibold text-[18px] text-white">{slot}</Text>
              <View className="ml-[6px]">
                <ChevronDown size={14} />
              </View>
            </View>
            {!isToday ? (
              <Text className="font-barlow text-[12px] text-textSecondary">{formatDayWithWeekday(day)}</Text>
            ) : null}
          </Pressable>
        </View>

        {/* Balances the close button so the title sits in the true centre. */}
        <View className="h-[44px] w-[44px]" />
      </View>

      {/* ── The search field ──────────────────────────────────────────── */}
      <View className="px-[16px] pb-[12px] pt-[4px]">
        <View className="h-[48px] flex-row items-center rounded-full border border-buttonBorder bg-secondary pl-[16px]">
          <SearchIcon size={18} />
          <TextInput
            value={query}
            onChangeText={(text) => {
              setQuery(text)
              if (mode !== "search") setMode("search")
            }}
            onFocus={() => setMode("search")}
            autoFocus={params.focus === "1"}
            placeholder="Search foods or brands"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Search foods, saved meals or brands"
            returnKeyType="search"
            autoCorrect={false}
            keyboardAppearance="dark"
            maxLength={100}
            className="ml-[10px] h-full flex-1 font-barlow text-[16px] text-white"
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear the search"
              onPress={() => setQuery("")}
              className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
            >
              <View className="h-[18px] w-[18px] items-center justify-center rounded-full bg-textSecondary">
                <CloseIcon size={10} color={colors.secondary} />
              </View>
            </Pressable>
          ) : (
            <View className="w-[12px]" />
          )}
        </View>
      </View>

      {/*
        The other ways onto the plate. A hairline under the controls closes them
        off from the list; while typing only the search field is above it.
      */}
      <View className="border-b border-hairline">
        {!typing ? (
          <View className="flex-row gap-[8px] px-[16px] pb-[12px]">
            <ModeChip
              label="Scan"
              icon={<BarcodeIcon size={18} color={mode === "scan" ? colors.ground : colors.white} />}
              active={mode === "scan"}
              onPress={() => toggleMode("scan")}
            />
            <ModeChip
              label="Quick add"
              icon={<FlameIcon size={16} color={mode === "quick-add" ? colors.ground : colors.white} />}
              active={mode === "quick-add"}
              onPress={() => toggleMode("quick-add")}
            />
            <ModeChip
              label="New food"
              icon={<PlusIcon size={16} color={colors.white} />}
              active={false}
              onPress={() => router.push("/create-food")}
            />
          </View>
        ) : null}
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        // Zero, for the reason `log-weight.tsx` spells out at length.
        keyboardVerticalOffset={0}
      >
        <View className="flex-1">
          {mode === "scan" ? (
            <BarcodeScanner
              paused={sheet !== null || plateOpen || slotOpen}
              onFound={openFood}
              // `read=1`: the user tapped "Add it from the label", so the
              // label camera opens straight away (decided 2026-10-26).
              onCreate={(barcode) => router.push(`/create-food?barcode=${barcode}&read=1`)}
            />
          ) : mode === "quick-add" ? (
            <QuickAddPanel onAdd={(item) => add([item], item.name, draftItemMacros(item).kcal)} />
          ) : mode === "ai" ? (
            <View className="mx-[16px] mt-[16px] rounded-[12px] border border-cardBorder bg-card px-[14px] py-[12px]">
              <Text className="font-barlow text-[14px] text-textSecondary">
                Describing a meal to the assistant lands in Phase 9. Search, scan or quick add for now.
              </Text>
            </View>
          ) : searching ? (
            <SearchResults
              query={settledQuery.trim()}
              result={search}
              local={localSearch}
              onOpen={openFood}
              onQuickAdd={addFood}
              onCreate={() => router.push(`/create-food?name=${encodeURIComponent(settledQuery.trim())}`)}
              savedMeals={matchingSavedMeals(savedMeals.data?.meals ?? [], settledQuery)}
              onOpenSaved={(meal) => router.push(`/saved-meal?id=${meal.id}&slot=${slot}&date=${day}`)}
              onAddSaved={addSavedMeal}
            />
          ) : (
            <Home
              slot={slot}
              result={recent}
              onOpen={openFood}
              onQuickAdd={addFood}
              onScan={() => setMode("scan")}
              savedMeals={savedMeals.data?.meals ?? []}
              savedMealsState={savedMeals.isPending ? "loading" : savedMeals.isError ? "error" : "ready"}
              onRetrySaved={() => void savedMeals.refetch()}
              onOpenSaved={(meal) => router.push(`/saved-meal?id=${meal.id}&slot=${slot}&date=${day}`)}
              onAddSaved={addSavedMeal}
              onSeeAllSaved={() => router.push("/saved-meals")}
            />
          )}
        </View>

        {/* ── Log the plate — only when there is a plate to log ─────────── */}
        {plate.length > 0 ? (
          <View
            className="px-[16px] pt-[8px]"
            style={{ paddingBottom: (keyboardVisible ? 8 : insets.bottom) + 8 }}
          >
            {saveError ? (
              <Text className="mb-[8px] font-barlow text-[13px] text-danger">{saveError}</Text>
            ) : null}
            {/*
              The plate, minified, and the button that logs it. The left half
              says what the plate is (which meal, how many items, how much) and
              opens it; the right half logs it.
            */}
            <View className="h-[64px] flex-row items-center rounded-[18px] border border-buttonBorder bg-card pl-[16px] pr-[8px]">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${slot}: ${plate.length} ${plate.length === 1 ? "item" : "items"}, ${formatKcal(totals.kcal)} calories. Open the plate.`}
                onPress={() => setPlateOpen(true)}
                className="h-full flex-1 justify-center pr-[8px] active:opacity-70"
              >
                <Text numberOfLines={1} className="font-barlow-semibold text-[15px] text-white">
                  {slot} · {plate.length} {plate.length === 1 ? "item" : "items"}
                </Text>
                <View className="flex-row items-center">
                  <Text className="mr-[8px] font-barlow-bold text-[14px] text-white">
                    {formatKcal(totals.kcal)} cal
                  </Text>
                  <MacroCompact macros={totals} />
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Log ${slot}, ${formatKcal(totals.kcal)} calories`}
                accessibilityState={{ disabled: !canLog, busy: logMeal.isPending }}
                disabled={!canLog}
                onPress={logPlate}
                className={`h-[48px] items-center justify-center rounded-full px-[22px] ${
                  canLog ? "bg-primary active:opacity-80" : "bg-secondary"
                }`}
              >
                <Text className={`font-barlow-semibold text-[16px] ${canLog ? "text-ground" : "text-textSecondary"}`}>
                  {logMeal.isPending ? "Logging…" : "Log"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* Under the header, over the content. */}
      <View className="absolute inset-x-0" style={{ top: insets.top + 56 }} pointerEvents="box-none">
        <AddedToast
          toast={sheet || plateOpen || slotOpen ? null : toast}
          onPress={() => {
            setToast(null)
            setPlateOpen(true)
          }}
          onUndo={undo}
          onDone={() => setToast(null)}
        />
      </View>

      {sheet ? (
        <ServingSheet
          key={sheet.item.key}
          item={sheet.item}
          imageUrl={sheet.kind === "add" ? sheet.food.imageUrl : null}
          detail={
            sheet.kind === "add"
              ? [sheet.food.brand, sourceLabel(sheet.food)].filter(Boolean).join(" · ") || null
              : null
          }
          serving={
            sheet.kind === "add" && (sheet.food.serving.label || sheet.food.measure)
              ? { quantity: sheet.food.serving.quantity, label: servingText(sheet.food) }
              : null
          }
          budget={budgetFor(sheet)}
          confirmLabel={sheet.kind === "add" ? `Add to ${slot}` : "Update"}
          onConfirm={(item) => {
            if (sheet.kind === "add") add([item], sheet.food.name, draftItemMacros(item).kcal)
            else updatePlateItem(item)
            setSheet(null)
          }}
          onRemove={
            sheet.kind === "edit"
              ? () => {
                  removeFromPlate(sheet.item.key)
                  setSheet(null)
                }
              : undefined
          }
          onClose={() => setSheet(null)}
        />
      ) : plateOpen ? (
        <PlateSheet
          slot={slot}
          items={plate}
          totals={totals}
          onEdit={editLine}
          onClear={clearPlate}
          onLog={logPlate}
          logging={logMeal.isPending}
          canLog={canLog}
          error={
            saveError ??
            (createSaved.error ? saveErrorMessage(createSaved.error, SAVED_MEAL_WORDING) : null)
          }
          onSaveMeal={saveAsMeal}
          saving={createSaved.isPending}
          savedAs={savedAs}
          onClose={() => setPlateOpen(false)}
        />
      ) : slotOpen ? (
        <SlotSheet
          value={slot}
          suggested={mealNameFor(currentClockTime())}
          onChange={(next) => {
            setSlot(next)
            setSlotOpen(false)
          }}
          onClose={() => setSlotOpen(false)}
        />
      ) : null}
    </View>
  )
}

/** Where a food's numbers came from, for the line under its name in the panel. */
function sourceLabel(food: Food): string | null {
  switch (food.origin) {
    case "recent":
      return "You've logged this"
    case "mine":
      return "Your food"
    case "off":
    case "shared":
      return "Open Food Facts"
  }
}

/** One of Scan · Quick add · New food. White when its mode is open. */
function ModeChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      className={`h-[40px] flex-1 flex-row items-center justify-center rounded-full border active:opacity-80 ${
        active ? "border-white bg-white" : "border-buttonBorder bg-secondary"
      }`}
    >
      {icon}
      <Text
        numberOfLines={1}
        className={`ml-[6px] font-barlow-medium text-[14px] ${active ? "text-ground" : "text-white"}`}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * The search box empty: "Usually at breakfast" — this meal's regulars first,
 * then everything else lately — and Saved meals.
 */
function Home({
  slot,
  result,
  onOpen,
  onQuickAdd,
  onScan,
  savedMeals,
  savedMealsState,
  onRetrySaved,
  onOpenSaved,
  onAddSaved,
  onSeeAllSaved,
}: {
  slot: MealSlot
  result: ReturnType<typeof useRecentFoods>
  onOpen: (food: Food) => void
  onQuickAdd: (food: Food) => void
  onScan: () => void
  savedMeals: readonly SavedMeal[]
  /**
   * The saved-meals query's own state, so a library that is still loading or
   * failed is not drawn as an empty one (Standards axis, 2026-10-20).
   */
  savedMealsState: "loading" | "error" | "ready"
  onRetrySaved: () => void
  onOpenSaved: (meal: SavedMeal) => void
  onAddSaved: (meal: SavedMeal) => void
  onSeeAllSaved: () => void
}) {
  if (result.isPending) return <Loading label="Loading your foods" />
  if (result.isError) return <ErrorState error={result.error} onRetry={() => void result.refetch()} />

  const foods = result.data.foods
  if (foods.length === 0 && savedMeals.length === 0) {
    return (
      <Empty
        title="Search for a food"
        detail="Type a food or a brand above, or scan a barcode. What you log shows up here, so next time is one tap."
        action={{ label: "Scan a barcode", onPress: onScan }}
      />
    )
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="pb-[24px] pt-[18px]"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {foods.length > 0 ? (
        <View className="px-[16px]">
          <Text className="font-barlow-bold text-[17px] text-white">Usually at {slot.toLowerCase()}</Text>
          <View className="mt-[4px]">
            {foods.map((food, index) => (
              <FoodRow
                key={`${food.name}-${index}`}
                food={food}
                onOpen={() => onOpen(food)}
                onQuickAdd={() => onQuickAdd(food)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View className="mt-[20px] pl-[16px]">
        <SavedMealStrip
          meals={savedMeals}
          heading="Saved meals"
          onOpen={onOpenSaved}
          onAdd={onAddSaved}
          onSeeAll={onSeeAllSaved}
        />
        {savedMealsState === "loading" ? (
          <Text className="font-barlow text-[14px] text-textSecondary">Loading your saved meals…</Text>
        ) : savedMealsState === "error" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your saved meals didn't load. Try again."
            onPress={onRetrySaved}
            className="h-[44px] justify-center active:opacity-70"
          >
            <Text className="font-barlow text-[14px] text-danger">
              Your saved meals didn't load. <Text className="text-link">Try again</Text>
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  )
}

/**
 * Saved meals whose name contains the query. A filter over a list already in
 * hand, not a request — the library is small and already loaded for the strip.
 */
function matchingSavedMeals(meals: readonly SavedMeal[], query: string): SavedMeal[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return []
  return meals.filter((meal) => meal.name.toLowerCase().includes(needle))
}

/**
 * Results in two groups: **your foods** (logged before, or created by you) and
 * **all foods** (the shared cache and Open Food Facts). The server returns them
 * in that order already; the split only adds the headings and the "Yours" mark.
 *
 * ## Two requests, drawn as they land (2026-10-20)
 *
 * `local` (your foods and the saved ones) answers in a few hundred
 * milliseconds; `result` (the same plus Open Food Facts) can take seconds. The
 * local answer is drawn as soon as it is in, with "Searching Open Food Facts…"
 * where the rest will go, and the full answer replaces it when it arrives. A
 * stale answer from the previous query is never drawn as this one's.
 */
function SearchResults({
  query,
  result,
  local,
  onOpen,
  onQuickAdd,
  onCreate,
  savedMeals,
  onOpenSaved,
  onAddSaved,
}: {
  query: string
  result: ReturnType<typeof useFoodSearch>
  local: ReturnType<typeof useLocalFoodSearch>
  onOpen: (food: Food) => void
  onQuickAdd: (food: Food) => void
  onCreate: () => void
  savedMeals: readonly SavedMeal[]
  onOpenSaved: (meal: SavedMeal) => void
  onAddSaved: (meal: SavedMeal) => void
}) {
  const forThis = (data: FoodSearch | undefined) =>
    data && data.query.toLowerCase() === query.toLowerCase() ? data : null
  const full = forThis(result.data)
  const fast = forThis(local.data)
  const data = full ?? fast
  /** Open Food Facts is still out: the local answer is up, the rest is coming. */
  const offPending = full === null && result.isFetching

  if (!data) {
    if (result.isError && (local.isError || !local.isFetching)) {
      return <ErrorState error={result.error} onRetry={() => void result.refetch()} />
    }
    return <Loading label="Searching" />
  }

  const notice = full ? offNotice(full.off) : null
  const foods = data.foods
  const yours = foods.filter((food) => food.origin === "recent" || food.origin === "mine")
  const others = foods.filter((food) => food.origin !== "recent" && food.origin !== "mine")

  if (foods.length === 0 && savedMeals.length === 0 && !offPending) {
    return (
      <Empty
        title={`No matches for “${query}”`}
        detail={notice ?? "Try fewer words, or add it yourself from the label."}
        action={{ label: "Add it from the label", onPress: onCreate }}
      />
    )
  }

  const row = (food: Food, index: number, badge?: string) => (
    <FoodRow
      // OFF hits have no id; the barcode is unique within a result list,
      // and the index breaks the tie for anything with neither.
      key={food.id ?? food.barcode ?? `${food.name}-${index}`}
      food={food}
      badge={badge}
      onOpen={() => onOpen(food)}
      onQuickAdd={() => onQuickAdd(food)}
    />
  )

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-[16px] pb-[24px] pt-[16px]"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <SavedMealStrip meals={savedMeals} heading="Saved meals" onOpen={onOpenSaved} onAdd={onAddSaved} />

      {yours.length > 0 ? (
        <>
          <Text className="font-barlow-bold text-[17px] text-white">Your foods</Text>
          <View className="mb-[18px] mt-[4px]">{yours.map((food, index) => row(food, index, "Yours"))}</View>
        </>
      ) : null}

      {others.length > 0 || offPending ? (
        <View className="flex-row items-baseline justify-between">
          <Text className="font-barlow-bold text-[17px] text-white">All foods</Text>
          <Text className="font-barlow text-[12px] text-textSecondary">Open Food Facts</Text>
        </View>
      ) : null}
      {notice ? <Text className="mt-[4px] font-barlow text-[13px] text-amber">{notice}</Text> : null}
      <View className="mt-[4px]">{others.map((food, index) => row(food, index))}</View>
      {offPending ? (
        <View className="h-[52px] flex-row items-center">
          <ActivityIndicator color={colors.textSecondary} />
          <Text className="ml-[10px] font-barlow text-[14px] text-textSecondary">Searching Open Food Facts…</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Create a food called ${query}`}
        onPress={onCreate}
        className="mt-[4px] h-[52px] flex-row items-center active:opacity-70"
      >
        <PlusIcon size={18} />
        <Text className="ml-[10px] flex-1 font-barlow-medium text-[15px] text-link" numberOfLines={1}>
          Not here? Create “{query}”
        </Text>
      </Pressable>
    </ScrollView>
  )
}

/**
 * The line under the results when the Open Food Facts half is missing.
 *
 * Amber, because it is a warning about the list rather than an error: what is
 * shown is right, it is just not everything. Saying nothing would let "not in
 * the results" read as "does not exist".
 */
function offNotice(status: OffStatus): string | null {
  switch (status) {
    case "unavailable":
      return "Open Food Facts isn't answering, so these are only foods already saved here."
    case "rate-limited":
      return "Searched a lot in the last minute. Showing saved foods only for a moment."
    default:
      return null
  }
}
