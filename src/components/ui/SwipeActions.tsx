import { useRef, type ReactNode } from "react"
import { Pressable as RNPressable, Text } from "react-native"
import { Pressable } from "react-native-gesture-handler"
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable"

import { colors } from "@/design/tokens"

/**
 * A row you can tap to open, swipe **left to reveal Delete**, and swipe
 * **right to reveal Edit**. Nothing happens until the revealed button is
 * tapped; Delete then asks "are you sure".
 *
 * ## How it got here (iPhone, 2026-10-20)
 *
 * 1. Deleting a meal took four taps: open it, Edit, Delete, confirm.
 * 2. A left swipe revealing Edit and Delete side by side cut that, but a long
 *    swipe also landed as a tap and opened the meal: the row was a React Native
 *    `Pressable`, which does not know about gesture-handler's pan. The tap is
 *    now gesture-handler's own `Pressable`, which stands down once a swipe has
 *    the touch.
 * 3. One action per direction, with the swipe itself acting: too eager. A
 *    swipe went straight to "Delete Breakfast?" or into the editor.
 * 4. Now: one action per side, **revealed, not performed**. Swipe left, tap
 *    Delete, confirm. Swipe right, tap Edit. Left for delete is the iOS
 *    convention (Mail, Messages, Reminders).
 *
 * The row slides over the buttons, so `background` must be the colour of the
 * surface the row sits on, or the buttons show through it at rest.
 */

/** Width of a revealed button, and so how far the row slides open. */
const BUTTON_WIDTH = 92

export function SwipeActions({
  children,
  background,
  onPress,
  pressLabel,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
}: {
  /** The row's content. Not pressable itself: the tap is handled here. */
  children: ReactNode
  /** The surface colour behind the row, e.g. `colors.card`. */
  background: string
  onPress: () => void
  /** VoiceOver label for the tap, e.g. "Breakfast, 380 calories. Open it." */
  pressLabel: string
  /** Left out where a row has nothing to edit (a chat): no right swipe then. */
  onEdit?: () => void
  /** Called on tapping the revealed Delete; the caller asks "are you sure". */
  onDelete: () => void
  /** VoiceOver labels — "Edit Breakfast", "Delete Breakfast". */
  editLabel?: string
  deleteLabel: string
}) {
  const ref = useRef<SwipeableMethods>(null)

  /** Close the row, then act: the row is back in place behind any prompt. */
  function act(run: () => void) {
    ref.current?.close()
    run()
  }

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      leftThreshold={BUTTON_WIDTH / 2}
      rightThreshold={BUTTON_WIDTH / 2}
      overshootLeft={false}
      overshootRight={false}
      childrenContainerStyle={{ backgroundColor: background }}
      // Swiping right reveals the left side: Edit.
      renderLeftActions={onEdit ? () => (
        <RNPressable
          accessibilityRole="button"
          accessibilityLabel={editLabel}
          onPress={() => act(onEdit)}
          className="items-center justify-center bg-secondary active:opacity-80"
          style={{ width: BUTTON_WIDTH }}
        >
          <Text className="font-barlow-semibold text-[15px] text-white">Edit</Text>
        </RNPressable>
      ) : undefined}
      // Swiping left reveals the right side: Delete.
      renderRightActions={() => (
        <RNPressable
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          onPress={() => act(onDelete)}
          className="items-center justify-center active:opacity-80"
          // Runtime colour: the button's surface is a token value.
          style={{ width: BUTTON_WIDTH, backgroundColor: colors.danger }}
        >
          <Text className="font-barlow-semibold text-[15px] text-ground">Delete</Text>
        </RNPressable>
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pressLabel}
        accessibilityActions={[
          ...(onEdit ? [{ name: "edit", label: editLabel }] : []),
          { name: "delete", label: deleteLabel },
        ]}
        onAccessibilityAction={(event) => (event.nativeEvent.actionName === "delete" ? onDelete() : onEdit?.())}
        onPress={onPress}
        // Runtime press feedback: gesture-handler's Pressable takes a style
        // function, not NativeWind's `active:` classes.
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        {children}
      </Pressable>
    </ReanimatedSwipeable>
  )
}
