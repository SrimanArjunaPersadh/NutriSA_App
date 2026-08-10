import "../../global.css";
import "@/components/nativewind-interop";

import { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useFonts } from "expo-font";
import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
} from "@expo-google-fonts/barlow";
import { BarlowCondensed_800ExtraBold_Italic } from "@expo-google-fonts/barlow-condensed";

Sentry.init({
  dsn: "https://bdb95a636040e72d8b779057d72a2549@o4511882881007616.ingest.us.sentry.io/4511883769085952",
  sendDefaultPii: false,
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error(
    "Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to the .env file at the project root",
  );
}

void SplashScreen.preventAutoHideAsync();

/**
 * Renders the application root layout with loaded fonts, authentication, safe-area support, and navigation.
 *
 * @returns The root application layout.
 */
function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowCondensed_800ExtraBold_Italic,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Hold on the ground colour until the fonts land, so the wordmark never
  // flashes in the system face first.
  if (!fontsLoaded && !fontError) return <View className="flex-1 bg-ground" />;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#0D0F14" },
          }}
        />
      </SafeAreaProvider>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
