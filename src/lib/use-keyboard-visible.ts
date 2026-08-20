import { useEffect, useState } from "react"
import { Keyboard, Platform } from "react-native"

/**
 * Whether the software keyboard is up.
 *
 * Used by the entry form's pinned bar to drop its home-indicator inset while
 * the keyboard is covering the indicator. Without it the bar floats a home
 * indicator's height above the keyboard — a gap of app-ground colour that reads
 * as a rendering fault rather than as spacing.
 *
 * `keyboardWillShow` on iOS and `keyboardDidShow` on Android, deliberately.
 * iOS fires the `will` events alongside the keyboard's own animation, so the
 * bar moves with it in one motion; Android does not emit `will` events at all
 * for most input modes, so asking for them there gives a bar that never moves.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"

    const show = Keyboard.addListener(showEvent, () => setVisible(true))
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false))

    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return visible
}
