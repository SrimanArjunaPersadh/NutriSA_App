import { useEffect, useMemo, useRef, useState } from "react"
import { PanResponder, View, type LayoutChangeEvent } from "react-native"

/**
 * A horizontal slider over 0–1 — the food detail sheet's amount control,
 * `src/design/nutrition_tabs.jpeg`, third screen.
 *
 * Built on React Native's own `PanResponder` rather than a slider package: it
 * is one track, one thumb and one gesture, and a dependency for that is a
 * native module Expo Go may or may not carry at whatever version it ships.
 *
 * It speaks **fractions only**. What a fraction means in grams, and how it
 * snaps, is the engine's `quantityAtFraction` — the slider never sees a
 * quantity, so it cannot do arithmetic on one.
 *
 * 44pt tall for the touch target; the visible track is 4pt inside it. Adjustable
 * for VoiceOver: swipe up and down steps it, through `onStep`.
 *
 * ## `onDragging`: the scroll view around it must stop
 *
 * Refusing termination below only settles who owns the gesture among JS
 * responders. The sheet's ScrollView is a native UIScrollView, and its pan
 * recogniser does not ask: on the iPhone (2026-10-20) a drag that drifted up or
 * down moved the thumb **and** scrolled the sheet at the same time. So the
 * slider reports when a drag starts and ends, and the sheet turns its scrolling
 * off for exactly that long.
 */
export function AmountSlider({
  fraction,
  onFraction,
  onStep,
  accessibilityLabel,
  accessibilityValue,
  onDragging,
}: {
  fraction: number
  onFraction: (fraction: number) => void
  /** True when a drag starts, false when it ends however it ends. */
  onDragging?: ((dragging: boolean) => void) | undefined
  /** VoiceOver's increment / decrement — one notch either way. */
  onStep: (direction: 1 | -1) => void
  accessibilityLabel: string
  /** What VoiceOver reads as the current value, e.g. "170 grams". */
  accessibilityValue: string
}) {
  const [width, setWidth] = useState(0)
  const widthRef = useRef(0)
  const startX = useRef(0)
  // The responder is created once; the latest callback is read through a ref,
  // updated after render rather than during it (the React Compiler is on).
  const onFractionRef = useRef(onFraction)
  const onDraggingRef = useRef(onDragging)
  useEffect(() => {
    onFractionRef.current = onFraction
    onDraggingRef.current = onDragging
  })

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Hold the gesture once it starts: the sheet around this scrolls, and
        // a drag that wanders vertically must keep moving the thumb.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          onDraggingRef.current?.(true)
          startX.current = event.nativeEvent.locationX
          emit(startX.current)
        },
        onPanResponderMove: (_, gesture) => emit(startX.current + gesture.dx),
        onPanResponderRelease: () => onDraggingRef.current?.(false),
        onPanResponderTerminate: () => onDraggingRef.current?.(false),
      }),
    [],
  )

  function emit(x: number) {
    if (widthRef.current <= 0) return
    onFractionRef.current(Math.min(1, Math.max(0, x / widthRef.current)))
  }

  function onLayout(event: LayoutChangeEvent) {
    widthRef.current = event.nativeEvent.layout.width
    setWidth(event.nativeEvent.layout.width)
  }

  const clamped = Math.min(1, Math.max(0, fraction))

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: accessibilityValue }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => onStep(event.nativeEvent.actionName === "increment" ? 1 : -1)}
      onLayout={onLayout}
      className="h-[44px] justify-center"
      {...responder.panHandlers}
    >
      <View className="h-[4px] rounded-full bg-ringTrack" pointerEvents="none">
        <View className="h-[4px] rounded-full bg-primary" style={{ width: clamped * width }} />
      </View>
      <View
        pointerEvents="none"
        className="absolute h-[26px] w-[26px] rounded-full bg-white"
        // Centred on the fill's end; a runtime position, so a value not a class.
        style={{ left: clamped * width - 13 }}
      />
    </View>
  )
}
