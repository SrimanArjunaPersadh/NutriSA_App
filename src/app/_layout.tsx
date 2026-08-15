import "../../global.css";
import "@/components/nativewind-interop";

import { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
} from "@expo-google-fonts/barlow";
import { BarlowCondensed_800ExtraBold_Italic } from "@expo-google-fonts/barlow-condensed";

import { colors } from "@/design/tokens";
import { queryClient } from "@/lib/query-client";

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
    // QueryClientProvider sits inside ClerkProvider, not outside it: every query
    // reads the Clerk user id for its cache key and calls getToken() to
    // authenticate, so the auth context has to exist above them.
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          {/*
            Set once at the root rather than per screen. The app is dark only, so
            the status bar is always light — left to `auto` it follows the phone's
            system appearance and renders black-on-black for anyone whose iPhone
            is in light mode.
          */}
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.ground },
            }}
          >
            {/*
              The streak overlay. Declared here rather than left to file-based
              defaults because it needs three options none of the other routes
              want, and all three have to arrive together:

              - `transparentModal` keeps the dashboard mounted and visible behind
                it, which is what makes it an overlay rather than a screen.
              - `animation: "fade"` replaces the default slide. It resolves in
                place instead of travelling in from the edge.
              - `contentStyle` transparent **overrides the opaque ground set
                above**. Without it the screen fades to a solid colour with
                nothing behind it, and the transparent presentation buys nothing.

              Every other route still registers itself from the filesystem;
              naming one screen here does not opt the rest out.
            */}
            <Stack.Screen
              name="streak"
              options={{
                presentation: "transparentModal",
                animation: "fade",
                contentStyle: { backgroundColor: "transparent" },
              }}
            />
          </Stack>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
