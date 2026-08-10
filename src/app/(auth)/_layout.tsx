import { View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/expo";

/**
 * Keeps signed-in users out of the auth screens. Without this guard a signed-in
 * user who deep-links to /sign-in lands on a sign-in form they can't use.
 *
 * `isLoaded` is checked before `isSignedIn` on purpose: Clerk needs a moment to
 * restore the session from the token cache, and reading `isSignedIn` early
 * flashes this screen on every cold start.
 */
export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <View className="flex-1 bg-ground" />;
  if (isSignedIn) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0D0F14" },
      }}
    />
  );
}
