import { View } from "react-native"
import { Redirect } from "expo-router"
import { NativeTabs } from "expo-router/unstable-native-tabs"
import { useAuth } from "@clerk/expo"

import { colors } from "@/design/tokens"

/**
 * The signed-in shell. Four tabs, always the platform-native tab bar — see
 * AGENTS.md; the JavaScript `Tabs` and @react-navigation/bottom-tabs are both
 * off the table.
 *
 * The `unstable-native-tabs` import path is correct and expected, and it did not
 * change in the SDK 54 → 57 upgrade. The element shape did: `Icon` and `Label`
 * were top-level exports on 54 and are compound members on 57 —
 * `NativeTabs.Trigger.Icon` / `NativeTabs.Trigger.Label`. Verified against
 * node_modules/expo-router/build/native-tabs/NativeTabs.d.ts, which exports only
 * `NativeTabs` and `NativeTabTrigger`. Every prop on the `<NativeTabs>` tag below
 * survived the jump unrenamed.
 *
 * Android still gets labels without icons. That is now a choice rather than a
 * limit: SDK 54's `Icon` needed a `drawable` resource name and this project has
 * no android/ drawables (CNG owns that folder), but SDK 57's `Icon` also accepts
 * `md` for Material Symbols, which needs no drawable. iPhone is the target, so
 * closing that gap is its own small branch, not this one.
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
