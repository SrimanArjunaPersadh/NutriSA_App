import { useEffect, useRef, useState } from "react"
import { Linking, Pressable, Text, View } from "react-native"
import { CameraView, useCameraPermissions, type BarcodeType } from "expo-camera"

import { barcodeSchema, type Food } from "@shared"

import { ErrorState, Loading } from "@/components/state"
import { useBarcodeLookup } from "@/lib/queries"

/**
 * The Scan mode: point the camera at a packet, get the food.
 *
 * plan.md, Phase 7. `CameraView` with `onBarcodeScanned` — **not**
 * `launchScanner()`, which is not in Expo Go. The lookup is the server's
 * `GET /foods/barcode/:code`: local `foods` first, Open Food Facts on a miss,
 * every OFF hit cached as a global row so the next scan never leaves the
 * database.
 *
 * ## Every state, because a scanner has more than four
 *
 * Permission unknown, denied, and denied for good; scanning; looking up;
 * found; not in OFF; OFF unreachable; and our own server failing. Each one
 * says what happened and offers the next step — the plan's rule is that the
 * not-found path "falls through cleanly", and a scanner that dead-ends is the
 * fastest way back to typing.
 *
 * ## One scan at a time
 *
 * `onBarcodeScanned` fires on every frame the code is in view. The first valid
 * code locks the scanner (`code` is set) and the camera is paused until the
 * user scans again; without the lock, one packet held steady would fire a dozen
 * lookups and spend the OFF budget on the same product.
 */

/**
 * Retail symbologies only. A QR code on a packet is a marketing URL, and
 * decoding one would put a "not a barcode" error on screen for something the
 * user never meant to scan.
 */
const BARCODE_TYPES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e", "itf14"]

export function BarcodeScanner({
  paused,
  onFound,
  onCreate,
}: {
  /** True while something is on top — the serving sheet, the plate. */
  paused: boolean
  onFound: (food: Food) => void
  onCreate: (barcode: string) => void
}) {
  const [permission, requestPermission] = useCameraPermissions()
  const [code, setCode] = useState<string | null>(null)
  const lookup = useBarcodeLookup(code)

  /**
   * Hand a found food up once per scan. A ref rather than state, because the
   * effect must not fire again when the parent re-renders with the same result.
   */
  const delivered = useRef<string | null>(null)
  useEffect(() => {
    const food = lookup.data?.food
    if (!food || !code || delivered.current === code) return
    delivered.current = code
    onFound(food)
  }, [lookup.data, code, onFound])

  /**
   * Leaving to create the food marks this code delivered. Creating it
   * invalidates the lookup, the refetch finds the new row, and without this the
   * effect above would open the serving sheet for a food the create screen has
   * already put on the plate.
   */
  function create(barcode: string) {
    delivered.current = barcode
    onCreate(barcode)
  }

  function scanAgain() {
    delivered.current = null
    setCode(null)
  }

  if (!permission) {
    return <Loading label="Starting the camera" />
  }

  if (!permission.granted) {
    return (
      <CameraPanel
        title="Camera access is off"
        detail="NutriSA needs the camera to read the barcode on a packet. Nothing is recorded or kept."
        action={
          permission.canAskAgain
            ? { label: "Allow camera", onPress: () => void requestPermission() }
            : { label: "Open Settings", onPress: () => void Linking.openSettings() }
        }
      />
    )
  }

  return (
    <View className="flex-1">
      <View className="mx-[16px] mt-[12px] h-[260px] overflow-hidden rounded-[16px] border border-cardBorder bg-card">
        {/*
          Unmounted rather than hidden whenever it is not needed: only one
          camera preview can run at a time, and a paused-but-mounted preview
          still holds the camera.
        */}
        {!paused && code === null ? (
          <CameraView
            className="flex-1"
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={(result) => {
              if (code !== null) return
              const parsed = barcodeSchema.safeParse(result.data)
              if (parsed.success) setCode(parsed.data)
            }}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="font-barlow text-[14px] text-textSecondary">
              {code ? `Barcode ${code}` : "Camera paused"}
            </Text>
          </View>
        )}
      </View>

      <View className="mt-[12px] flex-1 px-[16px]">
        {code === null ? (
          <Text className="text-center font-barlow text-[14px] text-textSecondary">
            Hold the barcode inside the frame. It scans on its own.
          </Text>
        ) : lookup.isPending ? (
          <Loading label="Looking it up" />
        ) : lookup.isError ? (
          <ErrorState error={lookup.error} onRetry={() => void lookup.refetch()} />
        ) : lookup.data.food ? (
          <CameraPanel
            title={lookup.data.food.name}
            detail="Found. Choose how much you had."
            action={{ label: "Scan another", onPress: scanAgain }}
          />
        ) : lookup.data.off === "ok" ? (
          <CameraPanel
            title="Not in the food database yet"
            detail="Open Food Facts doesn't have this one with full nutrition. Add it from the label once and every scan after this finds it."
            action={{ label: "Add it from the label", onPress: () => create(code) }}
            secondary={{ label: "Scan again", onPress: scanAgain }}
          />
        ) : (
          <CameraPanel
            title="Couldn't check this barcode"
            detail={
              lookup.data.off === "rate-limited"
                ? "Too many lookups in the last minute. Try again shortly, or add it from the label."
                : "Open Food Facts isn't answering right now. Try again, or add it from the label."
            }
            action={{ label: "Try again", onPress: () => void lookup.refetch() }}
            secondary={{ label: "Add it from the label", onPress: () => create(code) }}
          />
        )}
      </View>
    </View>
  )
}

/**
 * A camera state's message and its next step. Exported as `CameraPanel` for
 * `label-camera.tsx`, so the two cameras ask for permission in the same words
 * and the same shape.
 */
export function CameraPanel({
  title,
  detail,
  action,
  secondary,
}: {
  title: string
  detail: string
  action: { label: string; onPress: () => void }
  secondary?: { label: string; onPress: () => void }
}) {
  return (
    <View className="items-center px-[8px] pt-[8px]">
      <Text className="text-center font-barlow-semibold text-[16px] text-white">{title}</Text>
      <Text className="mt-[6px] text-center font-barlow text-[14px] text-textSecondary">{detail}</Text>
      <View className="mt-[14px] flex-row gap-[10px]">
        {secondary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondary.label}
            onPress={secondary.onPress}
            className="h-[44px] items-center justify-center rounded-[10px] border border-buttonBorder px-[16px] active:opacity-80"
          >
            <Text className="font-barlow-semibold text-[15px] text-white">{secondary.label}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          className="h-[44px] items-center justify-center rounded-full bg-primary px-[18px] active:opacity-80"
        >
          <Text className="font-barlow-semibold text-[15px] text-ground">{action.label}</Text>
        </Pressable>
      </View>
    </View>
  )
}
