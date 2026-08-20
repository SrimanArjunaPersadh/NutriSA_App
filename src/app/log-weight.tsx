import { useEffect, useRef, useState } from "react"
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { currentLoggingDay, isLogDay, type LogDay } from "@engine"
import { MAX_WEIGHT_KG, type WriteWeight } from "@shared"

import { ChevronLeft, TrashIcon } from "@/components/icons/UiIcons"
import { DayStepper } from "@/components/logging/DayStepper"
import { FieldLabel } from "@/components/logging/fields"
import { ErrorState, Loading } from "@/components/state"
import { colors } from "@/design/tokens"
import { formatDayWithWeekday, formatKg } from "@/lib/format"
import { useDeleteWeight, useLogWeight, useWeightSeries } from "@/lib/queries"
import { deleteErrorMessage, saveErrorMessage, WEIGHT_WORDING } from "@/lib/save-message"
import { useKeyboardVisible } from "@/lib/use-keyboard-visible"
import { uuidv7 } from "@/lib/uuid"

/**
 * The weigh-in surface. One number, one day, one button.
 *
 * ## Why this is a screen and not a field on the tab
 *
 * plan.md, Phase 5: "log today's weight, one-handed". A field inline on a
 * scrolling tab has to live with the keyboard covering whatever is under it,
 * and the meal form already paid for that lesson once — see the
 * `keyboardVerticalOffset` note in `log-meal.tsx`. A pushed screen owns its
 * whole height, so the pad comes up, the value is at the top and Save is under
 * the thumb, and nothing else is competing for the space.
 *
 * ## There is no separate edit screen, and no `PATCH`
 *
 * Stepping the day back onto a day that already has a weigh-in **is** the edit:
 * the field prefills with what is stored, and saving replaces it, because
 * `POST /weight-logs` upserts on `(user_id, date)`. Decided on this branch
 * rather than inherited from the meal form — a weigh-in has no items, no
 * position in the day and no `created_at` worth preserving, so the argument
 * that earned `PATCH /meal-logs/:id` has nothing to hold onto here.
 * `server/routes/writes.ts` carries the same note from the server's side.
 *
 * Delete is the other operation, and it means something different from a
 * correction: it takes the day out of the series entirely. That is a real thing
 * to want — a reading off someone else's scale, a number typed into the wrong
 * day — and it is behind a confirm, like the meal delete.
 *
 * ## Nothing here computes a trend
 *
 * The raw reading goes up; every smoothed number on the Weight tab comes back
 * down from the server, where the engine runs over the whole history. This
 * screen's only arithmetic-shaped act is turning the typed characters into a
 * number, which is parsing, not calculation.
 */
export default function LogWeight() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ date?: string }>()
  const keyboardVisible = useKeyboardVisible()

  /**
   * The day being weighed.
   *
   * Seeded from the route so that tapping a row in the history opens that day,
   * and validated rather than trusted — a hand-typed deep link is the one path
   * that reaches this with rubbish in it, and `currentLoggingDay()` is the right
   * answer to rubbish.
   */
  const [day, setDay] = useState<LogDay>(() =>
    typeof params.date === "string" && isLogDay(params.date)
      ? params.date
      : currentLoggingDay(),
  )

  /**
   * The full history, not a window.
   *
   * The day stepper reaches 91 days back and every one of those days may
   * already hold a weigh-in this screen has to prefill and be able to delete —
   * and the id it deletes by is only on `entries`, which is windowed. A 30-day
   * window would prefill an empty field over a real stored reading and then
   * write a second one on save, which reads as the app having lost it.
   */
  const series = useWeightSeries("all")
  const stored = series.data?.entries.find((entry) => entry.day === day) ?? null

  const [reading, setReading] = useState("")

  /**
   * Which day the field currently holds a value for.
   *
   * The prefill has to follow the day — each day is its own reading — but it
   * must not re-run on every refetch, or a background poll would overwrite what
   * someone is halfway through typing. So it runs once per day, tracked here
   * rather than by an effect dependency, because "the data arrived" and "the
   * day changed" are two different reasons to fill the field and only one of
   * them may repeat.
   */
  const filledFor = useRef<LogDay | null>(null)
  useEffect(() => {
    if (!series.data || filledFor.current === day) return
    setReading(stored ? formatKg(stored.weightKg) : "")
    filledFor.current = day
  }, [series.data, day, stored])

  const logWeight = useLogWeight()
  const deleteWeight = useDeleteWeight()
  const saving = logWeight.isPending

  /**
   * The two failures are kept apart, deliberately.
   *
   * They were briefly one `saveError`, and a failed delete then printed save
   * copy — "That weigh-in is no longer there" — above a **Save** button that
   * would not retry the delete, and "your weigh-in is still here, try again",
   * which is reassurance after a failed save and the opposite of what a failed
   * delete means. Caught by `/nutrisa-review`, 2026-08-20.
   */
  const saveError = logWeight.error
  const deleteError = deleteWeight.error

  /**
   * The id this save is using, held across attempts.
   *
   * The same idempotency contract the meal form holds, and it matters here for
   * a subtler reason. A retry with a **fresh** id would not duplicate the
   * weigh-in — `(user_id, date)` is unique and the server upserts — it would
   * come back `replaced: true`, which is the server correctly reporting that
   * this save overwrote a previous weigh-in. Except the weigh-in it overwrote
   * was its own first attempt. Reusing the id keeps that answer honest.
   */
  const pendingId = useRef<string | null>(null)
  useEffect(() => {
    if (logWeight.error?.code === "conflict") pendingId.current = null
  }, [logWeight.error])

  const weightKg = parseWeight(reading)
  const canSave = weightKg !== null && !saving

  function save() {
    if (weightKg === null || saving) return

    pendingId.current ??= uuidv7()

    /**
     * `date` is sent **only when this is a back-date**, never for today.
     *
     * The standing rule is one time authority. Sending `date` unconditionally
     * would make the phone's clock the authority on every weigh-in, and at
     * 00:40 SAST the phone and `currentLoggingDay()` disagree by a whole day.
     * The comparison is against a **fresh** `currentLoggingDay()` rather than
     * the value `day` was seeded with, so a screen left open across midnight
     * correctly sends yesterday's date as the back-date it has become.
     */
    const isBackDate = day !== currentLoggingDay()

    const input: WriteWeight = {
      id: pendingId.current,
      ...(isBackDate ? { date: day } : {}),
      weightKg,
    }

    logWeight.mutate(input, { onSuccess: () => router.back() })
  }

  function confirmDelete() {
    if (!stored) return
    Alert.alert(
      "Delete this weigh-in?",
      `${formatKg(stored.weightKg)} kg on ${formatDayWithWeekday(stored.day)} comes out of the trend.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteWeight.mutate(stored.id, { onSuccess: () => router.back() }),
        },
      ],
    )
  }

  // ── The two states that belong to loading the history ─────────────────────
  if (series.isPending) {
    return (
      <Screen insetTop={insets.top} onBack={() => router.back()} title="Weigh in">
        <View className="h-[240px]">
          <Loading label="Loading your weigh-ins" />
        </View>
      </Screen>
    )
  }

  if (series.isError) {
    return (
      <Screen insetTop={insets.top} onBack={() => router.back()} title="Weigh in">
        <View className="h-[240px]">
          <ErrorState error={series.error} onRetry={() => void series.refetch()} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      insetTop={insets.top}
      onBack={() => router.back()}
      title={stored ? "Edit weigh-in" : "Weigh in"}
      onDelete={stored ? confirmDelete : undefined}
      deleting={deleteWeight.isPending}
    >
      <KeyboardAvoidingView
        className="flex-1"
        // iOS pushes the whole view; Android's window already resizes, and
        // doubling that up leaves a gap the height of the keyboard.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        // Zero, and it has to be zero — `log-meal.tsx` carries the full note on
        // why a positive offset makes the padding larger rather than smaller.
        keyboardVerticalOffset={0}
      >
        <View className="flex-1 px-[16px]">
          {/*
            Stepping the day clears a failed delete. It was about a row on the
            day you just left, and leaving it on screen would attach it to a
            different day's weigh-in — the one failure message in this app that
            could be read as being about the wrong row.
          */}
          <DayStepper
            day={day}
            onChange={(next) => {
              deleteWeight.reset()
              setDay(next)
            }}
          />

          <View className="mt-[28px] items-center">
            <FieldLabel>Weight</FieldLabel>
            <View className="flex-row items-baseline">
              {/*
                Not `NumberField`. That control is a 44pt row built for a form of
                six of them; this screen has one value on it and it is the
                subject, so it is set at display size and centred. The 44pt
                minimum is about touch targets, and this is a far larger one.
              */}
              <TextInput
                value={reading}
                onChangeText={setReading}
                placeholder="0.0"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Weight in kilograms"
                keyboardType="decimal-pad"
                keyboardAppearance="dark"
                autoFocus
                selectTextOnFocus
                maxLength={6}
                className="min-w-[140px] text-center font-display text-[56px] leading-[64px] text-white"
              />
              <Text className="ml-[6px] font-barlow text-[20px] text-textSecondary">kg</Text>
            </View>

            {/*
              Said before the save, not after it. Replacing a reading is the
              normal way to correct one and needs no warning, but it should
              never be a surprise — and on a back-dated day the stored number is
              the one thing the person stepping onto this screen cannot see.
            */}
            {stored ? (
              <Text className="mt-[14px] text-center font-barlow text-[14px] text-textSecondary">
                {`Replaces ${formatKg(stored.weightKg)} kg already logged on this day.`}
              </Text>
            ) : (
              <Text className="mt-[14px] text-center font-barlow text-[14px] text-textSecondary">
                One weigh-in a day. The trend does the rest.
              </Text>
            )}
          </View>
        </View>

        {/*
          The save button, pinned. Same reasoning as the meal form: the action
          belongs under the thumb, on the same edge, on every logging surface.
        */}
        <View
          className="border-t border-cardBorder bg-card px-[16px] pt-[12px]"
          // The home-indicator inset is dropped while the keyboard is up — the
          // keyboard covers the indicator, and reserving space for it leaves the
          // bar floating on a strip of ground colour above the keys.
          style={{ paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12 }}
        >
          {deleteError ? (
            <Text className="mb-[10px] font-barlow text-[13px] text-danger">
              {deleteErrorMessage(deleteError, WEIGHT_WORDING)}
            </Text>
          ) : null}

          {saveError ? (
            <Text className="mb-[10px] font-barlow text-[13px] text-danger">
              {saveErrorMessage(saveError, WEIGHT_WORDING)}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={stored ? "Save this weight" : "Log this weight"}
            accessibilityState={{ disabled: !canSave, busy: saving }}
            disabled={!canSave}
            onPress={save}
            className={`h-[52px] items-center justify-center rounded-[14px] ${
              canSave ? "bg-primary active:opacity-80" : "bg-secondary"
            }`}
          >
            <Text
              className={`font-barlow-semibold text-[17px] ${
                canSave ? "text-white" : "text-textSecondary"
              }`}
            >
              {saving ? "Saving…" : stored ? "Save weight" : "Log weight"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

/**
 * The typed characters as a weight, or null when they are not one yet.
 *
 * Deliberately **not** `toNumber` from `@/lib/meal-draft`. That one answers 0
 * for everything unusable, which is right for a macro field contributing to a
 * total and wrong here: this screen has to tell "nothing typed" from "zero
 * typed" to decide whether Save is pressable, and a 0 kg weigh-in is not a
 * thing anyone means.
 *
 * The upper bound is `MAX_WEIGHT_KG` — the width of the column, imported rather
 * than restated. Refusing here rather than letting the write make the trip is
 * only a courtesy: `writeWeightSchema` refuses it too, and is the one that
 * counts.
 *
 * Parsing, not arithmetic. It produces the number the user typed; it does not
 * derive one.
 */
function parseWeight(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed.length === 0) return null

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0 || value > MAX_WEIGHT_KG) return null
  return value
}

/**
 * The screen frame: a header that is always there, whatever state the body is
 * in. The same shape as the meal form's, and hoisted for the same reason — a
 * spinner on a screen with no way back is a trap, and it only appears when the
 * network is already misbehaving.
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

        <Text className="ml-[2px] font-barlow-semibold text-[18px] text-white">{title}</Text>

        <View className="flex-1" />

        {onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete this weigh-in"
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
