import { useEffect, useRef, useState } from "react"
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { PORTION_BASIS, type PortionUnit } from "@engine"
import { barcodeSchema, type WriteFood } from "@shared"

import { ChevronLeft } from "@/components/icons/UiIcons"
import { FieldLabel, NumberField, TextField } from "@/components/logging/fields"
import { basisLabel, MacroFields, UNIT_OPTIONS } from "@/components/logging/MealItemRow"
import { Dropdown } from "@/components/ui/Dropdown"
import { colors } from "@/design/tokens"
import { parseDecimal } from "@/lib/format"
import { draftItemFromFood, toNumber, type MacroText } from "@/lib/meal-draft"
import { addToPlate } from "@/lib/plate"
import { useCreateFood } from "@/lib/queries"
import { FOOD_WORDING, saveErrorMessage } from "@/lib/save-message"
import { useKeyboardVisible } from "@/lib/use-keyboard-visible"
import { uuidv7 } from "@/lib/uuid"

/**
 * Create a food of your own, from its label — `foods` with `source='manual'`.
 *
 * Reached from the logger two ways, both of them "the database does not have
 * this": the "Not here? Create …" row under a search (`?name=` pre-filled),
 * and a barcode Open Food Facts could not resolve (`?barcode=` pre-filled).
 * The second is the one that compounds: the food is stored with its barcode,
 * so the next scan of that packet is answered locally and never asks OFF again.
 *
 * The macros are typed **per basis**, the way the label prints them — "per 100
 * g" or "per slice" — and the heading over them is written from the unit, so
 * changing the unit cannot silently change what the numbers mean. The same
 * rule, and the same fields, as a line on the meal form.
 *
 * Saving puts one serving straight on the plate and goes back. The user came
 * here to log the thing, not to curate a database.
 */
export default function CreateFood() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const keyboardVisible = useKeyboardVisible()
  const params = useLocalSearchParams<{ name?: string; barcode?: string }>()

  const barcode = barcodeSchema.safeParse(params.barcode).data ?? null

  const [name, setName] = useState(typeof params.name === "string" ? params.name : "")
  const [unit, setUnit] = useState<PortionUnit>("g")
  const [serving, setServing] = useState("")
  const [per, setPer] = useState<MacroText>({ kcal: "", protein: "", carbs: "", fat: "" })

  const createFood = useCreateFood()
  /** The idempotency key, held across attempts. See `add-food.tsx`'s `pendingId`. */
  const pendingId = useRef<string | null>(null)
  useEffect(() => {
    if (createFood.error?.code === "conflict") pendingId.current = null
  }, [createFood.error])

  const servingAmount = parseDecimal(serving)
  const canSave = name.trim().length > 0 && !createFood.isPending

  function save() {
    if (!canSave) return
    pendingId.current ??= uuidv7()

    const input: WriteFood = {
      id: pendingId.current,
      name: name.trim(),
      unit,
      per: {
        kcal: toNumber(per.kcal),
        protein: toNumber(per.protein),
        carbs: toNumber(per.carbs),
        fat: toNumber(per.fat),
      },
      servingQuantity: servingAmount !== null && servingAmount > 0 ? servingAmount : null,
      barcode,
    }

    createFood.mutate(input, {
      onSuccess: (result) => {
        addToPlate(draftItemFromFood(result.food))
        router.back()
      },
    })
  }

  const defaultServing = PORTION_BASIS[unit] === 100 ? `100 ${unit}` : `1 ${unit}`

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
        <Text className="ml-[2px] font-barlow-semibold text-[18px] text-white">New food</Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        // Zero, for the reason `log-weight.tsx` spells out at length.
        keyboardVerticalOffset={0}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-[16px] pb-[32px]"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {barcode ? (
            <Text className="mb-[12px] font-barlow text-[13px] text-textSecondary">
              Barcode {barcode}. Saved with the food, so the next scan finds it.
            </Text>
          ) : null}

          <View className="flex-row">
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Koo Baked Beans"
              autoFocus={name.length === 0}
              maxLength={200}
            />
          </View>

          <View className="mt-[14px] flex-row items-end gap-[10px]">
            <View className="w-[132px]">
              <FieldLabel>Label quotes</FieldLabel>
              <Dropdown
                value={unit}
                options={UNIT_OPTIONS}
                onChange={setUnit}
                accessibilityLabel="The unit the label quotes its numbers in"
              />
            </View>
            <NumberField
              label="Usual serving"
              value={serving}
              onChangeText={setServing}
              suffix={unit}
              accessibilityLabel={`Usual serving in ${unit}. Leave empty for ${defaultServing}.`}
            />
          </View>

          <Text className="mt-[18px] font-barlow-bold text-[15px] text-white">
            Nutrition {basisLabel(unit)}
          </Text>
          <MacroFields
            values={per}
            onChange={(patch) => setPer((current) => ({ ...current, ...patch }))}
            accessibilityPrefix={`New food, ${basisLabel(unit)},`}
          />
        </ScrollView>

        <View
          className="border-t border-cardBorder bg-card px-[16px] pt-[12px]"
          style={{ paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12 }}
        >
          {createFood.error ? (
            <Text className="mb-[10px] font-barlow text-[13px] text-danger">
              {saveErrorMessage(createFood.error, FOOD_WORDING)}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save the food and add it to the plate"
            accessibilityState={{ disabled: !canSave, busy: createFood.isPending }}
            disabled={!canSave}
            onPress={save}
            className={`h-[48px] items-center justify-center rounded-full ${
              canSave ? "bg-primary active:opacity-80" : "bg-secondary"
            }`}
          >
            <Text className={`font-barlow-semibold text-[16px] ${canSave ? "text-ground" : "text-textSecondary"}`}>
              {createFood.isPending ? "Saving…" : "Save and add to plate"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}
