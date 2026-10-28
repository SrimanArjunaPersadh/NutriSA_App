import { useEffect, useRef, useState } from "react"
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Image } from "expo-image"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { labelFoodDraft, PORTION_BASIS, type LabelPer, type PortionUnit } from "@engine"
import { barcodeSchema, type LabelReading, type WriteFood } from "@shared"

import { ChevronLeft, CloseIcon, ScanIcon } from "@/components/icons/UiIcons"
import { FieldLabel, NumberField, TextField } from "@/components/logging/fields"
import { basisLabel, MacroFields, UNIT_OPTIONS } from "@/components/logging/MealItemRow"
import { Dropdown } from "@/components/ui/Dropdown"
import { colors } from "@/design/tokens"
import { ApiError } from "@/lib/api"
import { parseDecimal } from "@/lib/format"
import {
  deletePhotoFile,
  discardLabelPhoto,
  takePendingLabelPhoto,
  usePendingLabelPhoto,
  type LabelPhoto,
} from "@/lib/label-photo"
import { draftItemFromFood, toNumber, type MacroText } from "@/lib/meal-draft"
import { addToPlate } from "@/lib/plate"
import { useCreateFood, useReadLabel } from "@/lib/queries"
import { FOOD_WORDING, saveErrorMessage } from "@/lib/save-message"
import { useKeyboardVisible } from "@/lib/use-keyboard-visible"
import { uuidv7 } from "@/lib/uuid"

/**
 * Create a food of your own, from its label — `foods` with `source='manual'`,
 * or `source='label_scan'` when the label reader filled the form.
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
 *
 * ## Reading the label (Phase 8)
 *
 * "Read the label" opens `label-camera.tsx`; the photo comes back as a
 * thumbnail and is sent to `POST /api/label-reads`. The answer fills the form,
 * and **this form is the review step**: nothing is saved until the user taps
 * Save, having checked the numbers against the photo (tap the thumbnail to see
 * it full screen). On any failure the photo and the fields stay, with "Try
 * again" and "Type it in" — the failure path is this same form, never a
 * restart. Opened with `?read=1` (the scanner's "Add it from the label"), the
 * camera opens straight away.
 *
 * The photo is deleted when this screen closes, saved or not (see
 * `@/lib/label-photo`).
 */
export default function CreateFood() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const keyboardVisible = useKeyboardVisible()
  const params = useLocalSearchParams<{ name?: string; barcode?: string; read?: string }>()

  const barcode = barcodeSchema.safeParse(params.barcode).data ?? null

  const [name, setName] = useState(typeof params.name === "string" ? params.name : "")
  const [unit, setUnit] = useState<PortionUnit>("g")
  const [serving, setServing] = useState("")
  const [per, setPer] = useState<MacroText>({ kcal: "", protein: "", carbs: "", fat: "" })

  const label = useLabelReader({
    autoOpen: params.read === "1",
    openCamera: () => router.push("/label-camera"),
    onReading: (reading) => {
      const draft = labelFoodDraft(reading)
      // A name already typed (it came from the search) is never overwritten.
      if (reading.name) setName((current) => (current.trim() ? current : (reading.name ?? current)))
      setUnit(draft.unit)
      setServing(draft.servingQuantity === null ? "" : String(draft.servingQuantity))
      setPer(textFromLabel(draft.per))
    },
  })

  const createFood = useCreateFood()
  /** The idempotency key, held across attempts. See `add-food.tsx`'s `pendingId`. */
  const pendingId = useRef<string | null>(null)
  useEffect(() => {
    if (createFood.error?.code === "conflict") pendingId.current = null
  }, [createFood.error])

  const servingAmount = parseDecimal(serving)
  const canSave = name.trim().length > 0 && !createFood.isPending && !label.reading

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
      ...(label.filled ? { source: "label_scan" as const } : {}),
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

          <LabelPanel label={label} openCamera={() => router.push("/label-camera")} />

          {/*
            Locked while the label is being read: the answer replaces these
            fields, and a number changing under the thumb mid-edit is worse
            than fifteen seconds of waiting (decided 2026-10-26).
          */}
          <View
            pointerEvents={label.reading ? "none" : "auto"}
            className={label.reading ? "opacity-40" : ""}
          >
            <View className="flex-row">
              <TextField
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="Koo Baked Beans"
                autoFocus={name.length === 0 && params.read !== "1"}
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
            {label.missing.length > 0 ? (
              <Text className="mt-[4px] font-barlow text-[13px] text-textSecondary">
                Not on the photo: {listOf(label.missing)}. Type {label.missing.length === 1 ? "it" : "them"} in.
              </Text>
            ) : null}
            <MacroFields
              values={per}
              onChange={(patch) => setPer((current) => ({ ...current, ...patch }))}
              accessibilityPrefix={`New food, ${basisLabel(unit)},`}
            />
          </View>
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

      <PhotoViewer photo={label.viewing ? label.photo : null} onClose={label.closeViewer} />
    </View>
  )
}

type LabelReader = ReturnType<typeof useLabelReader>

/**
 * The label reader's state for this screen: the photo, the read, and what it
 * filled in.
 *
 * Owns the photo's lifetime. A new photo replaces (and deletes) the old one,
 * and whatever photo is held when the screen unmounts is deleted with it.
 */
function useLabelReader({
  autoOpen,
  openCamera,
  onReading,
}: {
  autoOpen: boolean
  openCamera: () => void
  onReading: (reading: LabelReading) => void
}) {
  const [photo, setPhoto] = useState<LabelPhoto | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [filled, setFilled] = useState(false)
  const [viewing, setViewing] = useState(false)
  const read = useReadLabel()
  const controller = useRef<AbortController | null>(null)

  function start(next: LabelPhoto) {
    Keyboard.dismiss()
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    read.mutate(
      { image: next.base64, signal: abort.signal },
      {
        onSuccess: (reading) => {
          if (reading.status === "not_a_label") return
          onReading(reading)
          setFilled(true)
          setMissing(missingFields(reading))
        },
      },
    )
  }

  /** The photo currently shown, for the effects below to delete. */
  const held = useRef<LabelPhoto | null>(null)
  useEffect(() => {
    held.current = photo
  }, [photo])

  // A photo handed back by the camera: take it, replace the old one, read it.
  const pending = usePendingLabelPhoto()
  useEffect(() => {
    if (!pending) return
    takePendingLabelPhoto()
    if (held.current) deletePhotoFile(held.current.uri)
    setPhoto(pending)
    start(pending)
    // `start` is recreated each render and deliberately left out: a new photo
    // is the only thing that should start a read.
  }, [pending])

  // `?read=1`: open the camera once, on arrival.
  const opened = useRef(false)
  useEffect(() => {
    if (!autoOpen || opened.current) return
    opened.current = true
    openCamera()
  }, [autoOpen, openCamera])

  // The photo goes when the screen does, saved or not.
  useEffect(
    () => () => {
      controller.current?.abort()
      discardLabelPhoto(held.current)
    },
    [],
  )

  return {
    photo,
    reading: read.isPending,
    result: read.data ?? null,
    error: read.error,
    filled,
    missing,
    viewing,
    retry: () => (photo ? start(photo) : undefined),
    cancel: () => {
      controller.current?.abort()
      read.reset()
    },
    /** "Type it in": the error goes, the photo and the fields stay. */
    dismiss: () => read.reset(),
    openViewer: () => setViewing(true),
    closeViewer: () => setViewing(false),
  }
}

/**
 * The reader's strip above the form: the entry button with no photo, then the
 * thumbnail with whichever of reading, failed, not-a-label or filled applies.
 */
function LabelPanel({ label, openCamera }: { label: LabelReader; openCamera: () => void }) {
  if (!label.photo) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Read the label with the camera"
        onPress={openCamera}
        className="mb-[16px] h-[48px] flex-row items-center justify-center gap-[8px] rounded-[12px] border border-buttonBorder bg-secondary active:opacity-80"
      >
        <ScanIcon size={18} color={colors.white} />
        <Text className="font-barlow-semibold text-[15px] text-white">Read the label</Text>
      </Pressable>
    )
  }

  const status = labelStatus(label)

  return (
    <View className="mb-[16px] flex-row gap-[12px] rounded-[12px] border border-cardBorder bg-card p-[10px]">
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel="See the label photo full screen"
        onPress={label.openViewer}
        className="h-[72px] w-[72px] overflow-hidden rounded-[8px] bg-secondary active:opacity-80"
      >
        <Image
          source={{ uri: label.photo.uri }}
          contentFit="cover"
          className="h-full w-full"
          // Never copied into expo-image's disk cache: the photo is deleted
          // when this screen closes, and a cached copy would outlive it.
          cachePolicy="none"
          accessibilityIgnoresInvertColors
        />
      </Pressable>

      <View className="flex-1 justify-center">
        <Text
          className={`font-barlow-semibold text-[15px] ${status.tone === "danger" ? "text-danger" : "text-white"}`}
        >
          {status.title}
        </Text>
        {status.detail ? (
          <Text className="mt-[2px] font-barlow text-[13px] text-textSecondary">{status.detail}</Text>
        ) : null}
        <View className="mt-[6px] flex-row gap-[8px]">
          {status.actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => (action.run === "camera" ? openCamera() : action.run())}
              className="h-[44px] justify-center rounded-[10px] border border-buttonBorder px-[12px] active:opacity-80"
            >
              <Text className="font-barlow-semibold text-[14px] text-white">{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  )
}

type PanelStatus = {
  title: string
  detail: string | null
  tone: "neutral" | "danger"
  actions: { label: string; run: "camera" | (() => void) }[]
}

function labelStatus(label: LabelReader): PanelStatus {
  if (label.reading) {
    return {
      title: "Reading the label…",
      detail: null,
      tone: "neutral",
      actions: [{ label: "Cancel", run: label.cancel }],
    }
  }

  if (label.error) {
    return {
      title: "Couldn't read this label",
      detail: readFailureDetail(label.error),
      tone: "danger",
      actions: readFailureActions(label),
    }
  }

  if (label.result?.status === "not_a_label") {
    return {
      title: "That doesn't look like a nutrition table",
      detail: "Photograph the table on the back of the packet.",
      tone: "neutral",
      actions: [
        { label: "Retake", run: "camera" },
        { label: "Type it in", run: label.dismiss },
      ],
    }
  }

  if (label.filled) {
    return {
      title: "Filled from the label",
      detail: "Check each number against the photo before you save.",
      tone: "neutral",
      actions: [{ label: "Retake", run: "camera" }],
    }
  }

  // A photo with no read in flight and nothing applied: the user chose to
  // type it in after a failure. The photo stays to type from.
  return {
    title: "Type it in from the photo",
    detail: "Tap the photo to see it full size.",
    tone: "neutral",
    actions: [{ label: "Retake", run: "camera" }],
  }
}

/**
 * "Try again" only where the same photo can succeed. After the hourly cap or a
 * photo the server refused, it cannot, so the offer would be a dead end (Spec
 * axis, 2026-10-28): the cap gets "Type it in", a refused photo a retake.
 */
function readFailureActions(label: LabelReader): PanelStatus["actions"] {
  const typeItIn = { label: "Type it in", run: label.dismiss }
  switch (label.error?.code) {
    case "rate-limited":
      return [typeItIn]
    case "bad-request":
      return [{ label: "Retake", run: "camera" }, typeItIn]
    default:
      return [{ label: "Try again", run: label.retry }, typeItIn]
  }
}

function readFailureDetail(error: ApiError): string {
  switch (error.code) {
    case "rate-limited":
      return "That's a lot of labels this hour. Type this one in."
    case "network":
      return "Couldn't reach the server. Your photo is still here."
    case "bad-request":
      return "The photo couldn't be sent. Retake it, or type it in."
    default:
      return "Try again, or type it in from the photo."
  }
}

/** The label photo, full screen, to read the numbers against the fields. */
function PhotoViewer({ photo, onClose }: { photo: LabelPhoto | null; onClose: () => void }) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={photo !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 bg-ground" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="h-[56px] flex-row items-center px-[6px]">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the photo"
            onPress={onClose}
            className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
          >
            <CloseIcon size={20} color={colors.textSecondary} />
          </Pressable>
          <Text className="ml-[2px] font-barlow-semibold text-[18px] text-white">Label photo</Text>
        </View>
        {photo ? (
          <Image
            source={{ uri: photo.uri }}
            contentFit="contain"
            className="flex-1"
            cachePolicy="none"
            accessibilityLabel="The label photo"
          />
        ) : null}
      </View>
    </Modal>
  )
}

/** The engine's numbers as field text; a blank stays blank. */
function textFromLabel(per: LabelPer): MacroText {
  const text = (value: number | null) => (value === null ? "" : String(value))
  return { kcal: text(per.kcal), protein: text(per.protein), carbs: text(per.carbs), fat: text(per.fat) }
}

/** The figures the label reader could not read, in the order the form shows them. */
function missingFields(reading: LabelReading): string[] {
  const missing: string[] = []
  if (reading.energyKcal === null && reading.energyKj === null) missing.push("energy")
  if (reading.protein === null) missing.push("protein")
  if (reading.carbohydrate === null) missing.push("carbs")
  if (reading.fat === null) missing.push("fat")
  return missing
}

/** "protein", "protein and fat", "energy, carbs and fat". */
function listOf(words: string[]): string {
  if (words.length <= 1) return words.join("")
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
}
