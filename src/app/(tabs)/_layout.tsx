import { View } from "react-native"
import { Redirect } from "expo-router"
import { NativeTabs } from "expo-router/native-tabs"
import { useAuth } from "@clerk/expo"

import { colors } from "@/design/tokens"

/**
 * The signed-in shell. Four tabs, always the platform-native tab bar — see
 * AGENTS.md; the JavaScript `Tabs` and @react-navigation/bottom-tabs are both
 * off the table.
 *
 * Native Tabs went stable in SDK 58, so the import is `expo-router/native-tabs`.
 * The old `unstable-native-tabs` path still resolves on 58 but is deprecated and
 * `console.warn`s on every launch; it re-exports the same component. Do not
 * shorten the path to `expo-router/tabs`: on 58 that is the JavaScript tab bar.
 * The element shape last changed in the SDK 54 → 57 upgrade: `Icon` and `Label`
 * were top-level exports on 54 and are compound members since 57 —
 * `NativeTabs.Trigger.Icon` / `NativeTabs.Trigger.Label`. Verified against
 * node_modules/expo-router/build/native-tabs/index.d.ts. Every prop on the
 * `<NativeTabs>` tag below survived both jumps unrenamed.
 *
 * Android still gets labels without icons. That is now a choice rather than a
 * limit: SDK 54's `Icon` needed a `drawable` resource name and this project has
 * no android/ drawables (CNG owns that folder), but `Icon` also accepts `md` for
 * Material Symbols, which needs no drawable. On SDK 58 `md` additionally needs
 * the optional peer `expo-symbols` installed. iPhone is the target, so closing
 * that gap is its own small branch, not this one.
 *
 * The auth guard lives here rather than on a screen so that every tab is behind
 * it at once, and `isLoaded` is checked before `isSignedIn` for the same reason
 * as in (auth)/_layout.tsx — reading the flag before Clerk has restored the
 * session from the token cache bounces the user to sign-in on every cold start.
 */

// NativeTabs takes colour values, not classNames — see src/design/tokens.ts.
const GROUND = colors.ground
const ACTIVE = colors.primary
const INACTIVE = colors.textSecondary
const HAIRLINE = colors.hairline

export default function TabsLayout() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) return <View className="flex-1 bg-ground" />
  if (!isSignedIn) return <Redirect href="/sign-in" />

  return (
    <NativeTabs
      backgroundColor={GROUND}
      shadowColor={HAIRLINE}
      tintColor={ACTIVE}
      iconColor={{ default: INACTIVE, selected: ACTIVE }}
      labelStyle={{
        default: { fontFamily: "Barlow_500Medium", fontSize: 11, color: INACTIVE },
        selected: { fontFamily: "Barlow_600SemiBold", fontSize: 11, color: ACTIVE },
      }}
      // The dashboard ends in a static View, not a scroll edge, which iOS 18
      // and earlier read as "scrolled to the end" and fades the bar out.
      disableTransparentOnScrollEdge
    >
      {/*
        `disableAutomaticContentInsets`: the Dashboard pads its own top by
        exactly `insets.top` (see `(tabs)/index.tsx`). From react-native-screens
        4.30 (SDK 58) the tab also switches the screen's first ScrollView to
        automatic inset adjustment, and the two stacked into a ~60pt gap under
        the clock on the iPhone, 2026-10-28. The other tabs wrap their
        ScrollView in a padded View, which the automatic adjustment never
        reaches, so they need no flag.
      */}
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
        />
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="nutrition">
        <NativeTabs.Trigger.Icon sf="fork.knife" />
        <NativeTabs.Trigger.Label>Nutrition</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="weight">
        <NativeTabs.Trigger.Icon sf={{ default: "scalemass", selected: "scalemass.fill" }} />
        <NativeTabs.Trigger.Label>Weight</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="assistant">
        <NativeTabs.Trigger.Icon sf="sparkles" />
        <NativeTabs.Trigger.Label>AI Assistant</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
