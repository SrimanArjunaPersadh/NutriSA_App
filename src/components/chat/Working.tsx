import { useEffect, useRef, useState, type ComponentType, type ReactElement } from "react"
import { AccessibilityInfo, Animated, Easing, Text, View, type ViewProps } from "react-native"
import MaskedViewClass from "@react-native-masked-view/masked-view"
import { LinearGradient } from "expo-linear-gradient"

import { TickIcon } from "@/components/icons/UiIcons"
import { colors, withAlpha } from "@/design/tokens"
import { CHAT_STATUS_DONE, CHAT_STATUS_LINES, type TurnStep } from "@/lib/chat"

/**
 * What the coach shows while it works (plan.md, Phase 9, C2, C3; Sriman's
 * picks from the drawn options, 2026-10-29).
 *
 * A checklist, not a spinner: each lookup is a row, ticked when done, and the
 * one running now has a breathing dot and a light band sweeping across its
 * words. Seeing the work, and what it is for, makes a wait feel shorter
 * (Buell and Norton's labour illusion; Maister's explained waits). Before the
 * first lookup the single row reads "Thinking". The rows go as soon as the
 * reply starts typing.
 *
 * The shimmer is neutral grey to white, never copper: copper is the colour of
 * a button here, and a copper shimmer beside Confirm reads as one (C3).
 */

/**
 * The masked view, typed as the plain component it is. Its 0.3.2 typings (the
 * version `npx expo install` picks for SDK 58) declare a class built on an
 * older `NativeMethods`, which React Native 0.88's types no longer accept as a
 * JSX element. The runtime component is unchanged; only the declaration is.
 */
const MaskedView = MaskedViewClass as unknown as ComponentType<ViewProps & { maskElement: ReactElement }>

/** How wide the bright band is, and how long one sweep takes. */
const BAND = 56
const SWEEP_MS = 1600

const BAND_COLORS = [withAlpha(colors.white, 0), colors.white, withAlpha(colors.white, 0)] as const

/** True while the phone asks for reduced motion; the rows then hold still. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let live = true
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduce(on))
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce)
    return () => {
      live = false
      subscription.remove()
    }
  }, [])
  return reduce
}

/** The step in progress: grey words with a lighter band passing over them. */
function Shimmer({ text }: { text: string }) {
  const reduce = useReduceMotion()
  const [width, setWidth] = useState(0)
  const sweep = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (reduce || width === 0) return
    sweep.setValue(0)
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.linear, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [reduce, width, sweep])

  if (reduce) return <Text className="font-chat text-[14.5px] text-white">{text}</Text>

  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-BAND, width + BAND] })

  return (
    <MaskedView maskElement={<Text className="font-chat text-[14.5px] text-white">{text}</Text>}>
      <Text
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        className="font-chat text-[14.5px] text-dotMuted"
      >
        {text}
      </Text>
      {/* Runtime transform: the band's position on each frame. */}
      <Animated.View
        pointerEvents="none"
        className="absolute bottom-0 top-0 w-[56px]"
        style={{ transform: [{ translateX }] }}
      >
        <LinearGradient
          colors={BAND_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          className="h-full w-full"
        />
      </Animated.View>
    </MaskedView>
  )
}

/** A dot that breathes beside the step in progress. */
function PulseDot() {
  const reduce = useReduceMotion()
  const breath = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (reduce) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [reduce, breath])

  const opacity = reduce ? 1 : breath.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] })
  const scale = reduce ? 1 : breath.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] })

  return (
    <View className="h-[16px] w-[16px] items-center justify-center">
      {/* Runtime opacity and scale: the breath on each frame. */}
      <Animated.View className="h-[7px] w-[7px] rounded-full bg-white" style={{ opacity, transform: [{ scale }] }} />
    </View>
  )
}

/**
 * The checklist while a reply has no text yet. `steps` empty means no lookup
 * has started: the model is reading the question, and the row says so.
 */
export function WorkingSteps({ steps }: { steps: readonly TurnStep[] }) {
  const rows = steps.length === 0 ? null : steps

  return (
    <View className="gap-[7px]" accessibilityLiveRegion="polite">
      {rows === null ? (
        <View className="min-h-[24px] flex-row items-center gap-[9px]">
          <PulseDot />
          <Shimmer text="Thinking" />
        </View>
      ) : (
        rows.map((step) => (
          <View key={step.tool} className="min-h-[24px] flex-row items-center gap-[9px]">
            {step.done ? (
              <>
                <View className="h-[16px] w-[16px] items-center justify-center">
                  <TickIcon size={14} color={colors.textSecondary} />
                </View>
                <Text className="font-chat text-[14.5px] text-textSecondary">{CHAT_STATUS_DONE[step.tool]}</Text>
              </>
            ) : (
              <>
                <PulseDot />
                <Shimmer text={CHAT_STATUS_LINES[step.tool]} />
              </>
            )}
          </View>
        ))
      )}
    </View>
  )
}

/**
 * A lookup that starts after the reply has begun ("let me check", then a
 * search): one shimmering row under the text, no checklist above it.
 */
export function WorkingLine({ text }: { text: string }) {
  return (
    <View className="mt-[8px] min-h-[24px] flex-row items-center gap-[9px]">
      <PulseDot />
      <Shimmer text={text} />
    </View>
  )
}
