import { Pressable, Text, View } from "react-native"
import { useClerk } from "@clerk/expo"

import { currentLoggingDay } from "@engine"

import { clearQueryCache } from "@/lib/query-client"

/**
 * Holding screen for the three tabs the shell routes to but that have no UI
 * yet. Each is its own branch later; this exists so the tab bar can be walked
 * end to end on the device.
 *
 * Sign-out is parked here, and only here, until Settings lands. Without it the
 * sign-in flow can only be walked once per install, so the second SSO provider
 * becomes untestable. It is not in the design and comes out with this file.
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
  const { signOut } = useClerk()

  return (
    <View className="flex-1 items-center justify-center bg-ground px-[24px]">
      <Text className="font-display text-[36px] leading-[40px] text-white">{title}</Text>
      <Text className="mt-[8px] text-center font-barlow text-[16px] text-textSecondary">{note}</Text>

      <Text className="mt-[12px] font-barlow text-[13px] text-textSecondary">
        SAST day: {currentLoggingDay()}
      </Text>

      {/*
        Sign-out clears the React Query cache **before** ending the session.

        Order matters. `signOut()` flips Clerk's auth state, which unmounts the
        tabs and remounts the sign-in screen; clearing afterwards would race
        that re-render, and anything that mounted in between would be handed the
        previous user's cached day summary to draw. Clearing first means there
        is nothing left to hand anyone.

        This is the second of two locks on the same door — every query key is
        also namespaced by Clerk user id, so a second account could not read the
        first one's entries even if this call were removed. Both exist because
        they fail differently: the key namespace protects against a stale read,
        this protects against the data still sitting in memory at all.
      */}
      <Pressable
        className="mt-[32px] h-[44px] items-center justify-center rounded-[10px] bg-secondary px-[24px] active:opacity-90"
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => {
          clearQueryCache()
          void signOut()
        }}
      >
        <Text className="font-barlow-semibold text-[15px] text-white">Sign out</Text>
      </Pressable>
    </View>
  )
}
