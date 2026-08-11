import { Pressable, Text, View } from "react-native"
import { useClerk } from "@clerk/expo"

/**
 * Holding screen for the three tabs the shell routes to but that have no UI
 * yet. Each is its own branch later; this exists so the tab bar can be walked
 * end to end on the device.
 *
 * Sign-out is parked here, and only here, until Settings lands. Without it the
 * sign-in flow can only be walked once per install, so the second SSO provider
 * becomes untestable. It is not in the design and comes out with this file.
 */
export function TabPlaceholder({ title, note }: { title: string; note: string }) {
  const { signOut } = useClerk()

  return (
    <View className="flex-1 items-center justify-center bg-ground px-[24px]">
      <Text className="font-display text-[36px] leading-[40px] text-white">{title}</Text>
      <Text className="mt-[8px] text-center font-barlow text-[16px] text-[#8A8F98]">{note}</Text>

      <Pressable
        className="mt-[32px] h-[44px] items-center justify-center rounded-[10px] bg-secondary px-[24px] active:opacity-90"
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => void signOut()}
      >
        <Text className="font-barlow-semibold text-[15px] text-white">Sign out</Text>
      </Pressable>
    </View>
  )
}
