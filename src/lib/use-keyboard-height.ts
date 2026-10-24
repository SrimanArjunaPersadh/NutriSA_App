import { useEffect, useState } from "react"
import { Keyboard, LayoutAnimation, Platform, useWindowDimensions, type KeyboardEvent } from "react-native"

/**
 * How much of the bottom of the screen the software keyboard covers, in points.
 * Zero when it is down.
 *
 * ## Why the sheets do not use `KeyboardAvoidingView`
 *
 * `KeyboardAvoidingView` learns the keyboard's position **only from a
 * `keyboardWillShow` event**. One that mounts while the keyboard is already up
 * starts with no padding and stays that way until the next event — see
 * `componentDidMount` in RN 0.86's `KeyboardAvoidingView.js`, which clears its
 * state when the keyboard is hidden and does nothing at all when it is visible.
 *
 * That is exactly how the food logger's serving sheet is opened: you type a
 * search, the keyboard is up, you tap a result, and the sheet mounts over it.
 * It laid out underneath the keyboard. Reported on the iPhone, 2026-10-19, as
 * "the UI looks all messed up" on tapping a Greek yoghurt.
 *
 * This reads `Keyboard.metrics()` on mount, so a sheet opened over a visible
 * keyboard knows where it is from the first frame, then follows every
 * show / hide / frame change after that. It is only for overlays that span the
 * whole screen — the height is measured from the screen's bottom edge, which
 * is the overlap only when the view's bottom edge is the screen's.
 *
 * ## Layout arithmetic, not engine arithmetic
 *
 * `screenHeight - keyboardTop` is a point offset for positioning a view, the
 * same kind of number `PinnedBar`'s clearance is. Nothing about anyone's data.
 */
export function useKeyboardHeight(): number {
  const { height: screenHeight } = useWindowDimensions()
  const [keyboardTop, setKeyboardTop] = useState<number | null>(
    () => Keyboard.metrics()?.screenY ?? null,
  )

  useEffect(() => {
    const animate = (event: KeyboardEvent) => {
      // Move with the keyboard's own animation on iOS, as KeyboardAvoidingView
      // does, rather than snapping a frame ahead of or behind it.
      if (Platform.OS === "ios" && event.duration > 0) {
        LayoutAnimation.configureNext({
          duration: event.duration,
          update: { duration: event.duration, type: LayoutAnimation.Types.keyboard },
        })
      }
    }

    const show = (event: KeyboardEvent) => {
      animate(event)
      setKeyboardTop(event.endCoordinates.screenY)
    }
    const hide = (event: KeyboardEvent) => {
      animate(event)
      setKeyboardTop(null)
    }

    const subscriptions =
      Platform.OS === "ios"
        ? [
            Keyboard.addListener("keyboardWillShow", show),
            // A different keyboard type (search → decimal pad) is a different
            // height, announced as a frame change rather than a fresh show.
            Keyboard.addListener("keyboardWillChangeFrame", show),
            Keyboard.addListener("keyboardWillHide", hide),
          ]
        : [Keyboard.addListener("keyboardDidShow", show), Keyboard.addListener("keyboardDidHide", hide)]

    return () => {
      for (const subscription of subscriptions) subscription.remove()
    }
  }, [])

  return keyboardTop === null ? 0 : Math.max(0, screenHeight - keyboardTop)
}
