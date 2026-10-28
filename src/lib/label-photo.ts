import { useSyncExternalStore } from "react"
import { Directory, File, Paths } from "expo-file-system"

/**
 * The label photo, on its way from `label-camera.tsx` back to `create-food.tsx`.
 *
 * The camera is its own screen (decided 2026-10-26: the SDK 58 docs do not say
 * one `CameraView` can scan barcodes and take photos at once). It needs to hand
 * a photo back to the form that pushed it, and a route param would put a
 * megabyte of base64 into a URL. So the same small module store `plate.ts`
 * uses: the camera sets it and goes back, the form takes it and clears it.
 *
 * ## The photo is ephemeral
 *
 * plan.md's standing rule: label photos are "captured, sent to the model, and
 * discarded — never uploaded, never retained". The camera writes two files to
 * the cache directory (its own capture and the resized copy). The capture is
 * deleted the moment the copy exists; the copy is moved into
 * `LABEL_PHOTO_DIR`, lives only while the form shows it as a thumbnail, and is
 * deleted when the form closes, saved or not. The base64 is held in memory,
 * never written anywhere.
 *
 * An app killed or crashed with the form open never runs that delete, so the
 * folder is emptied whenever the app starts (`sweepLabelPhotos`, called from
 * the root layout). Found by the Privacy axis of `/nutrisa-review`, 2026-10-28.
 */

export type LabelPhoto = {
  /** The resized JPEG in `LABEL_PHOTO_DIR`, for the thumbnail. */
  uri: string
  /** The same JPEG, for the request body. */
  base64: string
}

/**
 * Where a label photo waits while the form shows it. A folder of our own, so
 * the launch sweep can empty it without guessing at other modules' file names.
 */
const LABEL_PHOTO_DIR = new Directory(Paths.cache, "label-photos")

let pending: LabelPhoto | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A photo the camera has handed back and the form has not taken yet. */
export function usePendingLabelPhoto(): LabelPhoto | null {
  return useSyncExternalStore(subscribe, () => pending, () => pending)
}

export function setPendingLabelPhoto(photo: LabelPhoto) {
  if (pending) deletePhotoFile(pending.uri)
  pending = photo
  for (const listener of listeners) listener()
}

/** The form has taken the photo into its own state; the store lets go of it. */
export function takePendingLabelPhoto() {
  pending = null
  for (const listener of listeners) listener()
}

/**
 * Moves a freshly saved photo into `LABEL_PHOTO_DIR` and answers its new URI.
 * Throws if it cannot, and the camera then deletes the file where it lies.
 */
export function keepLabelPhoto(uri: string): string {
  if (!LABEL_PHOTO_DIR.exists) LABEL_PHOTO_DIR.create({ intermediates: true, idempotent: true })
  const file = new File(uri)
  file.move(LABEL_PHOTO_DIR)
  return file.uri
}

/** Deletes the file behind a photo. Never throws: a missing file is already gone. */
export function deletePhotoFile(uri: string) {
  try {
    const file = new File(uri)
    if (file.exists) file.delete()
  } catch {
    // Nothing to do. The launch sweep or the OS clears what is left.
  }
}

/** Deletes a photo the form held, and any the camera handed back unclaimed. */
export function discardLabelPhoto(photo: LabelPhoto | null) {
  if (photo) deletePhotoFile(photo.uri)
  if (pending) {
    deletePhotoFile(pending.uri)
    takePendingLabelPhoto()
  }
}

/**
 * Empties `LABEL_PHOTO_DIR`. Run once when the app starts, when no form can be
 * holding a photo, so anything in it was left by a kill or a crash.
 */
export function sweepLabelPhotos() {
  try {
    if (LABEL_PHOTO_DIR.exists) LABEL_PHOTO_DIR.delete()
  } catch {
    // Best effort; the next launch tries again.
  }
}
