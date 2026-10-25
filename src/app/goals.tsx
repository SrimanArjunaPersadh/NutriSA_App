import { useEffect, useRef, useState } from "react"
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { useClerk } from "@clerk/expo"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { kcalFromMacros } from "@engine"
import {
  GOAL_WEIGHT_BOUNDS,
  goalWeightSchema,
  TARGET_BOUNDS,
  targetMacrosSchema,
  type Macros,
} from "@shared"

import { Card, CardLabel } from "@/components/dashboard/Card"
import { ChevronLeft } from "@/components/icons/UiIcons"
import { NumberField } from "@/components/logging/fields"
import { ErrorState, Loading } from "@/components/state"
import { colors } from "@/design/tokens"
import { formatKcal, formatKg, parseDecimal, withThousands } from "@/lib/format"
import { useProfile, useSetProfile, useSetTargets, useTargets } from "@/lib/queries"
import { clearQueryCache } from "@/lib/query-client"
import { GOAL_WORDING, saveErrorMessage, TARGETS_WORDING } from "@/lib/save-message"
import { useKeyboardVisible } from "@/lib/use-keyboard-visible"
import { uuidv7 } from "@/lib/uuid"

/**
 * Goals — every number the user aims for, seen and changed in one place, and
 * the account's way out. plan.md, Phase 7b; every decision below was settled
 * with Sriman on 2026-10-25 and is recorded there.
 *
 * ## Four numbers typed, none derived
 *
 * Calories and the three macros are independent fields. The one real target on
 * record is 2300 kcal over 167 / 195 / 60 g, which the engine prices at 1988
 * kcal; working the calorie target out from the macros would have cut it by
 * 312 without anyone choosing that. So the macro energy is shown as a note
 * under the fields, always, in neutral grey, and the screen never tells anyone
 * their numbers are wrong. The figure is `kcalFromMacros` from the engine.
 *
 * ## From today, and only today
 *
 * `validFrom` is never sent, so the server dates the change with
 * `currentLoggingDay()`. Past days keep the targets they had (effective dating,
 * `server/data/targets.ts`), which is what the line under the fields says.
 *
 * ## One Save, sending only what changed
 *
 * Targets and the goal weight are two routes (`POST /targets`, `PUT /profile`)
 * behind one button, pinned under the thumb. Untouched sections are not sent.
 * When one part saves and the other fails, the screen says which, keeps every
 * field as typed, and stays open; the next press sends only the part still
 * different from what is stored. Leaving with unsaved edits discards them
 * without a dialog.
 *
 * ## Bounds come from the shared schema
 *
 * Save is gated on `targetMacrosSchema` and `goalWeightSchema`, the same
 * schemas the server parses with, so the form cannot accept a value the server
 * would refuse or refuse one it would take.
 */

type TargetFields = { kcal: string; protein: string; carbs: string; fat: string }

const EMPTY_FIELDS: TargetFields = { kcal: "", protein: "", carbs: "", fat: "" }

/**
 * A stored number back into a field. `String`, not `formatKcal`: the field is
 * read back through `parseDecimal`, which treats a comma as the decimal point
 * (the SA keypad offers one), so "2,300" would come back as 2.3.
 */
function fieldsFrom(macros: Macros | null): TargetFields {
  if (!macros) return EMPTY_FIELDS
  return {
    kcal: String(macros.kcal),
    protein: String(macros.protein),
    carbs: String(macros.carbs),
    fat: String(macros.fat),
  }
}

/** The four fields as a target the server would accept, or null. */
function parseTargets(fields: TargetFields): Macros | null {
  const parsed = targetMacrosSchema.safeParse({
    kcal: parseDecimal(fields.kcal),
    protein: parseDecimal(fields.protein),
    carbs: parseDecimal(fields.carbs),
    fat: parseDecimal(fields.fat),
  })
  return parsed.success ? parsed.data : null
}

/** Why the four fields are not a target yet, in a sentence. Null when they are. */
function targetsProblem(fields: TargetFields): string | null {
  if (parseTargets(fields)) return null

  const values = [fields.kcal, fields.protein, fields.carbs, fields.fat]
  if (values.some((value) => value.trim().length === 0)) {
    return "Fill in all four to set your targets."
  }

  if (!targetMacrosSchema.shape.kcal.safeParse(parseDecimal(fields.kcal)).success) {
    return `Calories must be between ${withThousands(TARGET_BOUNDS.kcal.min)} and ${withThousands(TARGET_BOUNDS.kcal.max)} kcal.`
  }
  return `Each macro must be between ${TARGET_BOUNDS.grams.min} and ${withThousands(TARGET_BOUNDS.grams.max)} g.`
}

/**
 * The goal field as what it would save: a number, null to clear, or invalid.
 * Empty is a real answer, not a missing one: it clears the goal.
 */
function parseGoal(text: string): { valid: true; value: number | null } | { valid: false } {
  if (text.trim().length === 0) return { valid: true, value: null }
  const parsed = goalWeightSchema.safeParse(parseDecimal(text))
  return parsed.success ? { valid: true, value: parsed.data } : { valid: false }
}

function sameTargets(a: Macros, b: Macros): boolean {
  return a.kcal === b.kcal && a.protein === b.protein && a.carbs === b.carbs && a.fat === b.fat
}

type Part = "targets" | "goal"

export default function Goals() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const keyboardVisible = useKeyboardVisible()
  const { signOut } = useClerk()

  const targets = useTargets()
  const profile = useProfile()
  const setTargets = useSetTargets()
  const setProfile = useSetProfile()

  const stored = targets.data?.current?.macros ?? null
  const storedGoal = profile.data?.goalWeightKg ?? null

  const [fields, setFields] = useState<TargetFields>(EMPTY_FIELDS)
  const [goalText, setGoalText] = useState("")

  /**
   * The fields are filled once, when both reads first land, and never again.
   * The save invalidates both reads, and a refetch that refilled the fields
   * would overwrite a part the user is still correcting after a partial
   * failure. `initial` is what "untouched" is measured against.
   */
  const filled = useRef(false)
  const [initial, setInitial] = useState<{ fields: TargetFields; goal: string } | null>(null)
  useEffect(() => {
    if (filled.current || !targets.data || !profile.data) return
    filled.current = true

    const start = {
      fields: fieldsFrom(targets.data.current?.macros ?? null),
      goal: profile.data.goalWeightKg === null ? "" : formatKg(profile.data.goalWeightKg),
    }
    setFields(start.fields)
    setGoalText(start.goal)
    setInitial(start)
  }, [targets.data, profile.data])

  /**
   * The id this target change is using, held across attempts — the same
   * contract as every other create (see `useSetTargets`). Dropped on a
   * conflict, which means the id was used for a different day: a screen left
   * open across midnight.
   */
  const pendingTargetsId = useRef<string | null>(null)
  useEffect(() => {
    if (setTargets.error?.code === "conflict") pendingTargetsId.current = null
  }, [setTargets.error])

  /** What the last Save got through, and what it did not. */
  const [outcome, setOutcome] = useState<{ saved: Part[]; failed: Part[] } | null>(null)

  const parsedTargets = parseTargets(fields)
  const targetsDirty =
    initial !== null &&
    (Object.keys(fields) as (keyof TargetFields)[]).some(
      (key) => fields[key] !== initial.fields[key],
    )
  const targetsChanged =
    parsedTargets !== null && (stored === null || !sameTargets(parsedTargets, stored))
  const targetsBlocked = targetsDirty && parsedTargets === null

  const goal = parseGoal(goalText)
  const goalDirty = initial !== null && goalText !== initial.goal
  const goalChanged = goal.valid && goal.value !== storedGoal
  const goalBlocked = goalDirty && !goal.valid

  const saving = setTargets.isPending || setProfile.isPending
  const canSave =
    !saving && (targetsChanged || goalChanged) && !targetsBlocked && !goalBlocked

  async function save() {
    if (!canSave) return

    const tasks: { part: Part; run: Promise<unknown> }[] = []

    if (targetsChanged && parsedTargets) {
      pendingTargetsId.current ??= uuidv7()
      // No `validFrom`: today, decided by the server. See the note at the top.
      tasks.push({
        part: "targets",
        run: setTargets.mutateAsync({ id: pendingTargetsId.current, macros: parsedTargets }),
      })
    }
    if (goalChanged && goal.valid) {
      tasks.push({ part: "goal", run: setProfile.mutateAsync({ goalWeightKg: goal.value }) })
    }

    const results = await Promise.allSettled(tasks.map((task) => task.run))
    const failed = tasks.filter((_, i) => results[i]?.status === "rejected").map((t) => t.part)

    if (failed.length === 0) {
      router.back()
      return
    }
    setOutcome({ saved: tasks.map((t) => t.part).filter((part) => !failed.includes(part)), failed })
  }

  /**
   * Out of the stack first, then the cache, then the session.
   *
   * Goals is pushed above the tabs, so without `dismissAll` it would stay on
   * screen after sign-out while the tabs beneath it redirected. The cache is
   * cleared before `signOut()` for the reason given where this button used to
   * live (the Assistant placeholder): signing out unmounts the tabs and mounts
   * sign-in, and anything that rendered in between would be handed the
   * previous user's cached health data. Query keys are also namespaced by user
   * id, which is the second lock on the same door.
   */
  function onSignOut() {
    router.dismissAll()
    clearQueryCache()
    void signOut()
  }

  if (targets.isPending || profile.isPending) {
    return (
      <Screen insetTop={insets.top} onBack={() => router.back()}>
        <View className="h-[240px]">
          <Loading label="Loading your goals" />
        </View>
      </Screen>
    )
  }

  if (targets.isError || profile.isError) {
    return (
      <Screen insetTop={insets.top} onBack={() => router.back()}>
        <View className="h-[240px]">
          <ErrorState
            error={targets.error ?? profile.error}
            onRetry={() => {
              if (targets.isError) void targets.refetch()
              if (profile.isError) void profile.refetch()
            }}
          />
        </View>
      </Screen>
    )
  }

  const macroKcal = kcalFromMacros({
    protein: parseDecimal(fields.protein) ?? 0,
    carbs: parseDecimal(fields.carbs) ?? 0,
    fat: parseDecimal(fields.fat) ?? 0,
  })
  const targetsHint = targetsBlocked ? targetsProblem(fields) : null

  const setField = (key: keyof TargetFields) => (next: string) => {
    setOutcome(null)
    setFields((current) => ({ ...current, [key]: next }))
  }

  return (
    <Screen insetTop={insets.top} onBack={() => router.back()}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        // Zero, for the reason written out in `log-weight.tsx`.
        keyboardVerticalOffset={0}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-[16px] pb-[24px]"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card>
            <CardLabel>DAILY TARGETS</CardLabel>

            {stored === null ? (
              <Text className="mt-[8px] font-barlow text-[14px] text-textSecondary">
                No targets set yet. Fill in all four and the Dashboard starts measuring against
                them.
              </Text>
            ) : null}

            <View className="mt-[14px]">
              <NumberField
                label="Calories"
                value={fields.kcal}
                onChangeText={setField("kcal")}
                suffix="kcal"
                accessibilityLabel="Calorie target in kilocalories"
              />
            </View>

            <View className="mt-[14px] flex-row gap-[10px]">
              <NumberField
                label="Protein"
                value={fields.protein}
                onChangeText={setField("protein")}
                suffix="g"
                accessibilityLabel="Protein target in grams"
              />
              <NumberField
                label="Carbs"
                value={fields.carbs}
                onChangeText={setField("carbs")}
                suffix="g"
                accessibilityLabel="Carbohydrate target in grams"
              />
              <NumberField
                label="Fat"
                value={fields.fat}
                onChangeText={setField("fat")}
                suffix="g"
                accessibilityLabel="Fat target in grams"
              />
            </View>

            {/*
              Always shown, never coloured: a gap between this and the calorie
              target may be deliberate, so the screen states it and leaves it.
            */}
            <Text className="mt-[12px] font-barlow text-[14px] text-textSecondary">
              {`Your macros add up to ${formatKcal(macroKcal)} kcal.`}
            </Text>

            {targetsHint ? (
              <Text className="mt-[8px] font-barlow text-[13px] text-danger">{targetsHint}</Text>
            ) : null}

            <Text className="mt-[8px] font-barlow text-[13px] text-textSecondary">
              Changes apply from today. Past days keep the targets they had.
            </Text>
          </Card>

          <Card className="mt-[12px]">
            <CardLabel>GOAL WEIGHT</CardLabel>

            <View className="mt-[14px]">
              <NumberField
                label="Goal"
                value={goalText}
                onChangeText={(next) => {
                  setOutcome(null)
                  setGoalText(next)
                }}
                suffix="kg"
                accessibilityLabel="Goal weight in kilograms"
              />
            </View>

            <Text
              className={`mt-[10px] font-barlow text-[13px] ${goalBlocked ? "text-danger" : "text-textSecondary"}`}
            >
              {goalBlocked
                ? `Goal weight must be between ${GOAL_WEIGHT_BOUNDS.min} and ${GOAL_WEIGHT_BOUNDS.max} kg, to one decimal.`
                : storedGoal !== null && goal.valid && goal.value === null
                  ? "Saving with this empty clears your goal weight."
                  : storedGoal === null
                    ? "No goal set. Optional: the Weight tab works without one."
                    : "Moves the goal line, the ring and kg to go everywhere."}
            </Text>
          </Card>

          {/*
            Well clear of Save, on purpose: Save is pinned to the bottom edge,
            and this sits at the end of the scroll with the whole form between
            them. No confirm, because signing back in undoes it.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={onSignOut}
            className="mt-[40px] h-[44px] items-center justify-center rounded-[10px] border border-buttonBorder bg-secondary active:opacity-80"
          >
            <Text className="font-barlow-semibold text-[15px] text-white">Sign out</Text>
          </Pressable>
        </ScrollView>

        <View
          className="border-t border-cardBorder bg-card px-[16px] pt-[12px]"
          // Same inset rule as the weigh-in screen: the keyboard covers the
          // home indicator, so its inset is dropped while the keyboard is up.
          style={{ paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12 }}
        >
          {outcome ? <SaveOutcome outcome={outcome} targetsError={setTargets.error} goalError={setProfile.error} /> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save goals"
            accessibilityState={{ disabled: !canSave, busy: saving }}
            disabled={!canSave}
            onPress={() => void save()}
            className={`h-[52px] items-center justify-center rounded-full ${
              canSave ? "bg-primary active:opacity-80" : "bg-secondary"
            }`}
          >
            <Text
              className={`font-barlow-semibold text-[17px] ${
                canSave ? "text-ground" : "text-textSecondary"
              }`}
            >
              {saving ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

/**
 * What a Save that did not fully land says. Each failed part gets its own
 * sentence from `saveErrorMessage`, and a part that did save is named first,
 * so a partial failure never reads as "nothing happened".
 */
function SaveOutcome({
  outcome,
  targetsError,
  goalError,
}: {
  outcome: { saved: Part[]; failed: Part[] }
  targetsError: unknown
  goalError: unknown
}) {
  const saved =
    outcome.saved.length === 0
      ? null
      : outcome.saved[0] === "targets"
        ? "Your targets saved."
        : "Your goal weight saved."

  return (
    <View className="mb-[10px]">
      {saved ? (
        <Text className="font-barlow text-[13px] text-textSecondary">{saved}</Text>
      ) : null}
      {outcome.failed.map((part) => (
        <Text key={part} className="font-barlow text-[13px] text-danger">
          {part === "targets"
            ? saveErrorMessage(targetsError, TARGETS_WORDING)
            : saveErrorMessage(goalError, GOAL_WORDING)}
        </Text>
      ))}
    </View>
  )
}

/**
 * The frame every state draws inside, so there is always a way back. The same
 * shape as `log-weight.tsx`'s, without the delete: nothing on this screen is
 * deleted, a goal is cleared by emptying its field.
 */
function Screen({
  insetTop,
  onBack,
  children,
}: {
  insetTop: number
  onBack: () => void
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
        <Text className="ml-[2px] font-barlow-semibold text-[18px] text-white">Goals</Text>
      </View>

      {children}
    </View>
  )
}
