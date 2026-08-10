import { View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/expo";

/**
 * Manages access to authentication screens based on the current authentication state.
 *
 * @returns A loading placeholder while authentication initializes, a redirect for signed-in users, or the authentication screen stack.
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
