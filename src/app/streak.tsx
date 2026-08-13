import { useEffect, useRef } from "react"
import { Animated, Easing, Pressable, Text, View } from "react-native"
import { useRouter } from "expo-router"

import { FlameIcon } from "@/components/icons/UiIcons"
import { streak } from "@/components/dashboard/design-fixture"
import { colors, withAlpha } from "@/design/tokens"

/**
 * The streak overlay, reached from the pill in the dashboard header.
 *
 * ## Why it fades instead of sliding
 *
 * It is registered in `app/_layout.tsx` as a `transparentModal` with
 * `animation: "fade"`. A slide is a *navigation* gesture — it says you have
 * gone somewhere else and can come back. This is the same screen with a light
 * on it, so it resolves in place: the ground darkens, the flame arrives, and
 * nothing travels. That is also why the route sits at the root rather than
 * inside `(tabs)`; a transparent modal presented from the tab navigator would
 * be clipped to the tab's frame and leave the bar sitting on top of the scrim.
 *
 * The transparent presentation needs `contentStyle` overridden back to
 * transparent — the root Stack sets an opaque `ground` on every screen, and
 * inheriting it here would produce a fade to a solid colour with no dashboard
 * behind it, which is a fade to a different screen rather than an overlay.
 *
 * ## The flame animation
 *
 * The scrim and the content are faded by the navigator; the flame does its own
 * thing on top of that — it scales up from 0.8 and, once lit, breathes. This is
 * RN's `Animated` rather than Reanimated: it is two interpolations on one node,
 * `useNativeDriver` covers both, and it keeps a screen that has to look right
 * in Expo Go off the worklets path entirely.
 *
 * The flame reports the streak, which is why it is grey until today is logged.
 * It is the only flame on the screen — the prompt line beneath it says what to
 * do in words, so nothing else here needs to carry the symbol.
 */
export default function StreakOverlay() {
  const router = useRouter()

  const entrance = useRef(new Animated.Value(0)).current
  const breath = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [entrance])

  useEffect(() => {
    // Only a lit flame breathes. An unlit one that pulsed would be a grey shape
    // insisting on attention while saying that nothing has happened yet.
    if (!streak.lit) return

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [breath])

  // Scales in from 0.8, then breathes on top of that once lit. `breath` holds
  // at 0 when the loop above never starts, so the multiply is a no-op rather
  // than a branch.
  const flameScale = Animated.multiply(
    entrance.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
    breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
  )

  return (
    // The scrim is a plain View, not a Pressable. Tapping out is a habit worth
    // honouring on a sheet you might have opened by accident; this one has a
    // single explicit way on and a single explicit way out, and a stray tap
    // dismissing it would make the button below look optional.
    //
    // The colour goes through `withAlpha` rather than a `bg-ground/94`
    // className. Tailwind can produce that class, but nothing else in this app
    // uses an opacity modifier on a custom token, and this is the one value
    // that decides whether the screen reads as an overlay or as a new page —
    // not the place to be the first caller of an unproven path. 0.94 is a
    // device-check number: enough of the dashboard shows through to place you,
    // not enough to compete with the flame.
    <View
      className="flex-1 items-center justify-center px-[32px]"
      style={{ backgroundColor: withAlpha(colors.ground, 0.94) }}
    >
      <Animated.View style={{ opacity: entrance }} className="items-center">
        <Animated.View style={{ transform: [{ scale: flameScale }] }}>
          <FlameIcon
            size={96}
            color={streak.lit ? colors.amber : colors.textSecondary}
          />
        </Animated.View>

        <Text className="mt-[24px] font-display text-[72px] leading-[76px] text-white">
          {streak.days}
        </Text>
        <Text className="mt-[-4px] font-barlow-semibold text-[20px] tracking-[0.4px] text-textSecondary">
          Day streak
        </Text>

        {/*
          The one line on the screen that asks for something. It names the
          smallest action that changes the state — one meal, not "start
          tracking" — and it says what that action is worth, which the flame on
          its own could not.

          No icon on this line. It carried a small burning flame while the copy
          ended on one; now the sentence finishes in words, and a decorative
          flame after "going" would be a second flame competing with the one
          above that actually reports the state.
        */}
        <Text className="mt-[28px] text-center font-barlow text-[17px] text-white/80">
          Log one meal today to keep the streak going
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Let's go, back to the dashboard"
          onPress={() => router.back()}
          className="mt-[40px] h-[54px] w-full items-center justify-center rounded-full bg-primary px-[48px] active:opacity-80"
        >
          <Text className="font-barlow-semibold text-[18px] text-white">Let&apos;s go</Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}
