import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth, useClerk, useUser } from "@clerk/expo";

/**
 * Displays the authentication entry screen and signed-in NutriSA landing screen.
 *
 * @returns A loading indicator while authentication loads, a redirect for signed-out users, or the signed-in landing screen.
 */
export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();

  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <ActivityIndicator color="#0066FF" />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href="/sign-in" />;

  // Placeholder until the tab shell lands (plan.md Phase 3).
  return (
    <View className="flex-1 items-center justify-center bg-ground px-6">
      <Text className="font-display text-[48px] leading-[52px] text-white">
        Nutri<Text className="text-primary">SA</Text>
      </Text>
      <Text className="mt-3 text-center font-barlow text-[16px] text-white/70">
        Signed in as {user?.primaryEmailAddress?.emailAddress ?? "your account"}.
      </Text>

      {/*
        Sign-out lives here until the tab shell lands (plan.md Phase 3). Without
        it the sign-in flow can only ever be walked once per install, so there is
        no way to test the second provider.
      */}
      <Pressable
        className="mt-[32px] h-[44px] items-center justify-center rounded-[10px] bg-secondary px-[24px] active:opacity-90"
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => void signOut()}
      >
        <Text className="font-barlow-semibold text-[15px] text-white">Sign out</Text>
      </Pressable>
    </View>
  );
}
