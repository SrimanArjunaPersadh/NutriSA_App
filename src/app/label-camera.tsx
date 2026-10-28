import { useRef, useState } from "react"
import { Linking, Pressable, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { CameraView, useCameraPermissions } from "expo-camera"
import { ImageManipulator, SaveFormat } from "expo-image-manipulator"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { CameraPanel } from "@/components/food/BarcodeScanner"
import { CloseIcon } from "@/components/icons/UiIcons"
import { Loading } from "@/components/state"
import { colors } from "@/design/tokens"
import { deletePhotoFile, keepLabelPhoto, setPendingLabelPhoto } from "@/lib/label-photo"

/**
 * Photograph a nutrition label for the reader (Phase 8, `label-ocr`).
 *
 * Pushed from `create-food`, and back there the moment the shutter is pressed:
 * no "use this photo?" step, because the form shows the photo as a thumbnail
 * and a retake is one tap from there (decided 2026-10-26).
 *
 * ## What happens to the photo
 *
 * The capture is resized to a 1568 px long edge, JPEG at 0.7 — the size the
 * model scales down to anyway, so more pixels are only more upload. The
 * full-size capture is deleted as soon as the copy exists; the copy is moved
 * into the label-photo folder and goes to the form through `@/lib/label-photo`,
 * which deletes it when the form closes (and sweeps the folder at launch).
 * Nothing is uploaded anywhere but the one read.
 *
 * Its own screen rather than a mode of the barcode scanner: the SDK 58 docs do
 * not say one `CameraView` can scan and capture at once, and only one camera
 * preview can run at a time.
 */

/** The model's own working size. A longer edge is only more upload. */
const LONG_EDGE_PX = 1568
const JPEG_QUALITY = 0.7

export default function LabelCamera() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const camera = useRef<CameraView>(null)
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [failed, setFailed] = useState(false)

  /**
   * Set by Close. A capture still finishing when the user closes the camera is
   * thrown away rather than handed to the form, which would read it: a photo
   * the user abandoned must not reach the model (Privacy axis, 2026-10-28).
   */
  const closed = useRef(false)
  function close() {
    closed.current = true
    router.back()
  }

  async function capture() {
    if (!camera.current || !ready || capturing) return
    setCapturing(true)
    setFailed(false)

    let shotUri: string | null = null
    /** The resized copy, until it has been handed to the form. */
    let savedUri: string | null = null
    try {
      const shot = await camera.current.takePictureAsync({ quality: 1 })
      shotUri = shot.uri

      const context = ImageManipulator.manipulate(shot.uri)
      // Only ever down. A photo already smaller than the model's size is sent
      // as it is rather than blown up.
      if (Math.max(shot.width, shot.height) > LONG_EDGE_PX) {
        context.resize(
          shot.width >= shot.height
            ? { width: LONG_EDGE_PX, height: null }
            : { width: null, height: LONG_EDGE_PX },
        )
      }
      const image = await context.renderAsync()
      const saved = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: JPEG_QUALITY,
        base64: true,
      })
      savedUri = saved.uri
      if (!saved.base64) throw new Error("No base64 in the saved photo")
      if (closed.current) return

      const kept = keepLabelPhoto(saved.uri)
      savedUri = null
      setPendingLabelPhoto({ uri: kept, base64: saved.base64 })
      router.back()
    } catch {
      if (closed.current) return
      setFailed(true)
      setCapturing(false)
    } finally {
      // Whatever was not handed to the form is deleted here: the full-size
      // capture always, the resized copy on any failure or a close mid-capture.
      if (shotUri) deletePhotoFile(shotUri)
      if (savedUri) deletePhotoFile(savedUri)
    }
  }

  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
      <View className="h-[56px] flex-row items-center px-[6px]">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the camera"
          onPress={close}
          className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
        >
          <CloseIcon size={20} color={colors.textSecondary} />
        </Pressable>
        <Text className="ml-[2px] font-barlow-semibold text-[18px] text-white">Read the label</Text>
      </View>

      {!permission ? (
        <Loading label="Starting the camera" />
      ) : !permission.granted ? (
        <CameraPanel
          title="Camera access is off"
          detail="NutriSA needs the camera to read a nutrition label. The photo is read once and then deleted."
          action={
            permission.canAskAgain
              ? { label: "Allow camera", onPress: () => void requestPermission() }
              : { label: "Open Settings", onPress: () => void Linking.openSettings() }
          }
        />
      ) : (
        <>
          <View className="mx-[16px] flex-1 overflow-hidden rounded-[16px] border border-cardBorder bg-card">
            <CameraView
              ref={camera}
              className="flex-1"
              facing="back"
              mode="picture"
              onCameraReady={() => setReady(true)}
            />
          </View>

          <View className="items-center px-[16px] pt-[12px]" style={{ paddingBottom: insets.bottom + 16 }}>
            <Text
              className={`text-center font-barlow text-[14px] ${failed ? "text-danger" : "text-textSecondary"}`}
            >
              {failed
                ? "Couldn't take the photo. Try again."
                : "Fill the frame with the nutrition table and hold steady."}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take the photo"
              accessibilityState={{ disabled: !ready || capturing, busy: capturing }}
              disabled={!ready || capturing}
              onPress={() => void capture()}
              className={`mt-[14px] h-[72px] w-[72px] items-center justify-center rounded-full border-[4px] border-white ${
                ready && !capturing ? "active:opacity-70" : "opacity-40"
              }`}
            >
              <View className="h-[56px] w-[56px] rounded-full bg-white" />
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}
