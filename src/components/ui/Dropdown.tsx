import { useRef, useState } from "react"
import {
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type LayoutRectangle,
} from "react-native"

import { ChevronDown, TickIcon } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"

/**
 * A small anchored menu: a compact trigger, and a panel that opens under it.
 *
 * ## Why a menu and not a cycling button
 *
 * The chart's range control used to be a button that stepped 30 → 90 → 365 on
 * each tap. Sriman's verdict on the device, 2026-08-15: getting to the range
 * you want by tapping past the ones you do not is not a control, it is a
 * penance — and it gets worse with every option added. A menu shows all of them
 * and costs one tap to any of them.
 *
 * ## Why a Modal rather than an absolutely-positioned View
 *
 * A panel rendered inside the card would be clipped by any ancestor that clips
 * its children, and on Android an elevated sibling can paint over it regardless
 * of order. A `Modal` renders above everything by definition, on both
 * platforms, which is the entire reason it is worth measuring the trigger's
 * position by hand.
 *
 * ## Why the trigger is measured on press rather than on layout
 *
 * `measureInWindow` gives window coordinates, which is what the panel needs.
 * Taking it at press time rather than caching it from `onLayout` means the
 * panel is placed against where the trigger *is* — after any scrolling — rather
 * than where it was when the screen first rendered.
 */

export type DropdownOption<T extends string | number> = {
  value: T
  label: string
}

/** Menu rows clear the 44pt minimum on their own, without hitSlop. */
const ROW_HEIGHT = 44
const PANEL_WIDTH = 168
const GAP = 6
const SCREEN_MARGIN = 12

export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: {
  value: T
  options: readonly DropdownOption<T>[]
  onChange: (value: T) => void
  /** Describes what the menu selects, e.g. "Chart range". */
  accessibilityLabel: string
}) {
  const trigger = useRef<View>(null)
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null)
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()

  const selected = options.find((option) => option.value === value)

  function open() {
    trigger.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
    })
  }

  const panelHeight = options.length * ROW_HEIGHT + 8

  /**
   * Right-aligned with the trigger, because this control lives in the
   * top-right of a card and a left-aligned panel would hang off the screen.
   * Clamped so it cannot cross either edge whatever it is anchored to.
   */
  const right = anchor
    ? Math.max(SCREEN_MARGIN, screenWidth - (anchor.x + anchor.width))
    : SCREEN_MARGIN

  /** Flips above the trigger when there is not room below it. */
  const below = anchor ? anchor.y + anchor.height + GAP : 0
  const flip = below + panelHeight > screenHeight - SCREEN_MARGIN
  const top = anchor
    ? flip
      ? Math.max(SCREEN_MARGIN, anchor.y - GAP - panelHeight)
      : below
    : 0

  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}: ${selected?.label ?? ""}. Tap to change.`}
        onPress={open}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        className="h-[36px] flex-row items-center rounded-[9px] border border-buttonBorder bg-secondary px-[12px] active:opacity-80"
      >
        <Text className="font-barlow-medium text-[16px] text-white">
          {selected?.label ?? ""}
        </Text>
        <View className="ml-[8px]">
          <ChevronDown size={16} color={colors.textSecondary} />
        </View>
      </Pressable>

      <Modal
        visible={anchor !== null}
        transparent
        // Fade rather than slide: the panel belongs to the button it came out
        // of, and sliding it in from an edge would read as a new screen.
        animationType="fade"
        onRequestClose={() => setAnchor(null)}
      >
        {/*
          A full-screen backdrop that dismisses on tap. Unlike the streak
          overlay — where a stray tap must not close anything — tapping out of a
          menu is the universal way to say "never mind", and a menu that ignores
          it feels stuck.

          No scrim colour: dimming the screen for a four-row menu would announce
          it as a decision. It is a picker.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          className="flex-1"
          onPress={() => setAnchor(null)}
        />

        <View
          accessibilityRole="menu"
          className="absolute rounded-[12px] border border-buttonBorder bg-secondary py-[4px]"
          style={{ top, right, width: PANEL_WIDTH }}
        >
          {options.map((option) => {
            const isSelected = option.value === value
            return (
              <Pressable
                key={String(option.value)}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={option.label}
                onPress={() => {
                  setAnchor(null)
                  // Skipped when it changes nothing — re-selecting the current
                  // range should not throw away a settled query.
                  if (!isSelected) onChange(option.value)
                }}
                className="flex-row items-center justify-between px-[14px] active:opacity-70"
                style={{ height: ROW_HEIGHT }}
              >
                <Text
                  className={`font-barlow-medium text-[16px] ${
                    isSelected ? "text-white" : "text-textSecondary"
                  }`}
                >
                  {option.label}
                </Text>
                {/* The tick is the only mark of the current choice, so it is
                    not decorative — but it repeats what `selected` already
                    tells VoiceOver, hence not focusable. */}
                {isSelected ? <TickIcon size={16} color={colors.primary} /> : null}
              </Pressable>
            )
          })}
        </View>
      </Modal>
    </>
  )
}
