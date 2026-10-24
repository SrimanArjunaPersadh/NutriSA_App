import { useState } from "react"
import { Alert, Pressable, ScrollView, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { SavedMeal } from "@shared"

import { SavedMealRow } from "@/components/food/SavedMealCards"
import { ChevronLeft } from "@/components/icons/UiIcons"
import { Empty, ErrorState, Loading } from "@/components/state"
import { SwipeActions } from "@/components/ui/SwipeActions"
import { colors } from "@/design/tokens"
import { useDeleteSavedMeal, useSavedMeals } from "@/lib/queries"
import { deleteErrorMessage, SAVED_MEAL_WORDING } from "@/lib/save-message"

/**
 * The library — plan.md Phase 6's "saved meals list, search, categories".
 *
 * A pushed screen, not a tab: decided 2026-08-12, because you open the library
 * to log something, which is a nutrition action. Reached from the Nutrition
 * day view ("Saved meals") and from the logger's strip ("See all").
 *
 * Search is the logger's: typing there already matches saved meals by name, so
 * a second search box here would be a second way to do the same thing. This
 * screen filters by **category** instead, which is the one thing the logger
 * cannot do. The chips only appear when at least one meal has a category.
 *
 * Each row also swipes, the same `SwipeActions` as the Nutrition tab's meals
 * (2026-10-20): **left reveals Delete** (tap it, then confirm), **right reveals
 * Edit** (opens the meal already editing).
 *
 * Four states, as everywhere: loading, error, an empty library that says how
 * to fill it, and the list.
 */
export default function SavedMeals() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isPending, isError, error, refetch } = useSavedMeals()
  const [category, setCategory] = useState<string | null>(null)
  const remove = useDeleteSavedMeal()

  function confirmDelete(meal: SavedMeal) {
    Alert.alert(`Delete ${meal.name}?`, "It leaves your saved meals. Meals already logged from it stay logged.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          remove.mutate(meal.id, {
            onError: (error) => Alert.alert("Not deleted", deleteErrorMessage(error, SAVED_MEAL_WORDING)),
          }),
      },
    ])
  }

  const meals = data?.meals ?? []
  const categories = [...new Set(meals.map((meal) => meal.category).filter((c): c is string => !!c))].sort()
  const shown = category ? meals.filter((meal) => meal.category === category) : meals

  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
      <View className="h-[56px] flex-row items-center px-[6px]">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text className="ml-[2px] font-barlow-semibold text-[18px] text-white">Saved meals</Text>
      </View>

      {isPending ? (
        <Loading label="Loading your saved meals" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : meals.length === 0 ? (
        <Empty
          title="No saved meals yet"
          detail="Build a plate in the food logger, then tap Save as meal on the plate. It shows up here and as a one-tap tile when you log."
          action={{ label: "Open the food logger", onPress: () => router.push("/add-food") }}
        />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        >
          {categories.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-[12px]"
              contentContainerClassName="gap-[8px]"
            >
              {[null, ...categories].map((value) => {
                const active = value === category
                return (
                  <Pressable
                    key={value ?? "all"}
                    accessibilityRole="button"
                    accessibilityLabel={value ? `Show ${value}` : "Show all saved meals"}
                    accessibilityState={{ selected: active }}
                    onPress={() => setCategory(value)}
                    className={`h-[36px] justify-center rounded-full border px-[14px] ${
                      active ? "border-white bg-white" : "border-buttonBorder bg-secondary"
                    }`}
                    hitSlop={{ top: 4, bottom: 4 }}
                  >
                    <Text
                      className={`font-barlow-medium text-[14px] ${active ? "text-ground" : "text-white"}`}
                    >
                      {value ?? "All"}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          ) : null}

          <View className="gap-[10px]">
            {shown.map((meal) => (
              // The wrapper clips the swiped row's buttons to the card's corners.
              <View key={meal.id} className="overflow-hidden rounded-[14px]">
                <SwipeActions
                  background={colors.card}
                  onPress={() => router.push(`/saved-meal?id=${meal.id}`)}
                  pressLabel={`${meal.name}, ${meal.macros.kcal} calories. Open it.`}
                  onEdit={() => router.push(`/saved-meal?id=${meal.id}&edit=1`)}
                  onDelete={() => confirmDelete(meal)}
                  editLabel={`Edit ${meal.name}`}
                  deleteLabel={`Delete ${meal.name}`}
                >
                  <SavedMealRow meal={meal} />
                </SwipeActions>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )
}
