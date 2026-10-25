import { Text, View } from "react-native"

import { currentLoggingDay } from "@engine"

/**
 * Holding screen for a tab the shell routes to but that has no UI yet — today
 * only the AI Assistant, which Phase 9 fills. It exists so the tab bar can be
 * walked end to end on the device.
 *
 * Sign-out was parked here until a screen of its own existed. It moved to Goals
 * on `targets-and-profile` (plan.md, Phase 7b), so Phase 9 can replace this file
 * without stranding it.
 *
 * ## The SAST day line is a Metro test, not a feature
 *
 * `@engine` has been in tsconfig.json since Phase 1 and is proven under `tsx`,
 * which is what the server runs. Metro is a different resolver, and nothing had
 * ever imported the alias from the app side — plan.md records it as
 * "**unverified** on device because nothing imports it yet".
 *
 * This is that first import. If the date renders on the phone, Metro resolves
 * `@engine` and every later branch can import the engine freely; if the bundle
 * fails, it fails now, on a throwaway screen, instead of halfway through
 * building the dashboard. It comes out with the rest of this file.
 */
export function TabPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-ground px-[24px]">
      <Text className="font-display text-[36px] leading-[40px] text-white">{title}</Text>
      <Text className="mt-[8px] text-center font-barlow text-[16px] text-textSecondary">{note}</Text>

      <Text className="mt-[12px] font-barlow text-[13px] text-textSecondary">
        SAST day: {currentLoggingDay()}
      </Text>
    </View>
  )
}
