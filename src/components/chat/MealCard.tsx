import { Alert, Pressable, Text, View } from "react-native"
import { useRouter } from "expo-router"

import { currentLoggingDay } from "@engine"
import type { ChatProposal } from "@shared"

import { TickIcon } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"
import { cardState, expiredCardNote } from "@/lib/chat"
import { formatGrams, formatKcal } from "@/lib/format"
import { draftItemFromLogged } from "@/lib/meal-draft"
import { loadPlateFromCard, usePlate } from "@/lib/plate"
import { useDismissCard, useLogMeal } from "@/lib/queries"
import { MEAL_WORDING, saveErrorMessage } from "@/lib/save-message"

/**
 * A meal the assistant proposed (plan.md, Phase 9, Q5, Q29, A2, A3). The
 * headline of the tab: talking a meal in should end in one tap.
 *
 * Every number here is the server's: the card's macros were worked out by the
 * engine from stored food rows when the card was made. Confirm posts the card's
 * `meal` to the ordinary `POST /meal-logs`, unchanged; it carries the id the
 * server minted, so a second tap logs nothing twice. Whether it is logged is
 * read back from the server with the chat, never remembered here.
 */
export function MealCard({
  proposal,
  messageId,
}: {
  proposal: ChatProposal & { confirmed: boolean }
  /** The stored reply the card belongs to; null while it is still streaming. */
  messageId: string | null
}) {
  const router = useRouter()
  const plate = usePlate()
  const logMeal = useLogMeal()
  const dismiss = useDismissCard()

  const state = logMeal.isSuccess && !proposal.dismissed ? "logged" : cardState(proposal, currentLoggingDay())
  const { meal } = proposal

  function edit() {
    const open = () => {
      const lines = meal.items.map((item) => draftItemFromLogged({ ...item, portion: item.portion ?? null }))
      loadPlateFromCard(lines, meal.id)
      router.push(`/add-food?slot=${proposal.slot}&plate=1`)
    }
    if (plate.length === 0) {
      open()
      return
    }
    Alert.alert("Replace what's on your plate?", "The foods from this card take its place.", [
      { text: "Cancel", style: "cancel" },
      { text: "Replace", style: "destructive", onPress: open },
    ])
  }

  if (state === "dismissed") {
    return (
      <View className="mt-[10px] rounded-[12px] border border-cardBorder px-[14px] py-[10px]">
        <Text className="font-barlow text-[14px] text-textSecondary">
          {`${proposal.slot} card dismissed.`}
        </Text>
      </View>
    )
  }

  const muted = state === "expired"

  return (
    <View
      className={`mt-[10px] rounded-[16px] border border-cardBorder bg-card px-[14px] py-[14px] ${muted ? "opacity-60" : ""}`}
    >
      <View className="flex-row items-baseline justify-between">
        <Text className="font-barlow-semibold text-[16px] text-white">{proposal.slot}</Text>
        <Text className="font-barlow-semibold text-[16px] text-white">
          {`${formatKcal(meal.macros.kcal)} kcal`}
        </Text>
      </View>

      <View className="mt-[8px] gap-[6px]">
        {meal.items.map((item, index) => (
          <View key={`${item.name}-${index}`} className="flex-row justify-between">
            <Text className="mr-[12px] flex-1 font-barlow text-[14px] text-white" numberOfLines={2}>
              {item.qty ? `${item.name}, ${item.qty}` : item.name}
            </Text>
            <Text className="font-barlow text-[14px] text-textSecondary">
              {`${formatKcal(item.macros.kcal)} kcal`}
            </Text>
          </View>
        ))}
      </View>

      <View className="mt-[10px] flex-row gap-[14px] border-t border-hairline pt-[10px]">
        <MacroFigure label="Protein" grams={meal.macros.protein} dot="bg-protein" />
        <MacroFigure label="Carbs" grams={meal.macros.carbs} dot="bg-carbs" />
        <MacroFigure label="Fat" grams={meal.macros.fat} dot="bg-fats" />
      </View>

      {state === "expired" ? (
        <Text className="mt-[10px] font-barlow text-[13px] text-textSecondary">
          {expiredCardNote(proposal.day)}
        </Text>
      ) : null}

      {logMeal.error ? (
        <Text className="mt-[10px] font-barlow text-[13px] text-danger">
          {saveErrorMessage(logMeal.error, MEAL_WORDING)}
        </Text>
      ) : null}
      {dismiss.error ? (
        <Text className="mt-[10px] font-barlow text-[13px] text-danger">
          Couldn&apos;t dismiss this card. Try again.
        </Text>
      ) : null}

      {state === "logged" ? (
        <View className="mt-[12px] h-[44px] flex-row items-center gap-[8px]">
          <TickIcon size={16} color={colors.ok} />
          <Text className="font-barlow-semibold text-[15px] text-ok">{`Logged to ${proposal.slot}`}</Text>
        </View>
      ) : (
        <View className="mt-[12px] flex-row gap-[8px]">
          {state === "open" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Log this to ${proposal.slot}`}
              accessibilityState={{ busy: logMeal.isPending, disabled: logMeal.isPending }}
              disabled={logMeal.isPending}
              onPress={() => logMeal.mutate(meal)}
              className="h-[44px] flex-1 items-center justify-center rounded-full bg-primary active:opacity-80"
            >
              <Text className="font-barlow-semibold text-[15px] text-ground">
                {logMeal.isPending ? "Logging…" : "Confirm"}
              </Text>
            </Pressable>
          ) : null}
          <CardButton label="Edit" accessibilityLabel="Edit this meal before logging it" onPress={edit} />
          <CardButton
            label="Dismiss"
            accessibilityLabel="Dismiss this card"
            disabled={messageId === null || dismiss.isPending}
            onPress={() => (messageId ? dismiss.mutate(messageId) : undefined)}
          />
        </View>
      )}
    </View>
  )
}

/** `dot` is the macro's reserved colour class, written out whole so NativeWind sees it. */
function MacroFigure({
  label,
  grams,
  dot,
}: {
  label: string
  grams: number
  dot: "bg-protein" | "bg-carbs" | "bg-fats"
}) {
  return (
    <View className="flex-row items-center gap-[6px]">
      <View className={`h-[8px] w-[8px] rounded-full ${dot}`} />
      <Text className="font-barlow text-[13px] text-textSecondary">{`${label} ${formatGrams(grams)} g`}</Text>
    </View>
  )
}

function CardButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
}: {
  label: string
  accessibilityLabel: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-[44px] items-center justify-center rounded-full border border-buttonBorder bg-secondary px-[18px] active:opacity-80 ${disabled ? "opacity-50" : ""}`}
    >
      <Text className="font-barlow-semibold text-[15px] text-white">{label}</Text>
    </Pressable>
  )
}
