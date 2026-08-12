import { View } from "react-native"
import { Redirect } from "expo-router"
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs"
import { useAuth } from "@clerk/expo"

import { colors } from "@/design/tokens"

/**
 * The signed-in shell. Four tabs, always the platform-native tab bar — see
 * AGENTS.md; the JavaScript `Tabs` and @react-navigation/bottom-tabs are both
 * off the table.
 *
 * The `unstable-native-tabs` import path is correct and expected. Native Tabs is
 * alpha, and its API changed between SDK 54 and 55 — this file uses the **SDK 54**
 * shape (`Icon` / `Label` imported alongside `NativeTabs`), not the compound
 * `NativeTabs.Trigger.Icon` of 55+. The project is pinned to 54 because that is
 * what App Store Expo Go runs.
 *
 * Android gets labels without icons for now: SDK 54's `Icon` takes a `drawable`
 * resource name on Android, and this project has no android/ drawables to point
 * at (CNG owns that folder). iPhone is the Phase 3 target, so that is a gap to
 * close with a config plugin later, not a blocker now.
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
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} />
        <Label>Dashboard</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="nutrition">
        <Icon sf="fork.knife" />
        <Label>Nutrition</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="weight">
        <Icon sf={{ default: "scalemass", selected: "scalemass.fill" }} />
        <Label>Weight</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="assistant">
        <Icon sf="sparkles" />
        <Label>AI Assistant</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
