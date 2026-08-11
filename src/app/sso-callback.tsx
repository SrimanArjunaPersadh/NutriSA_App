import { View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";

/**
 * Landing point for the OAuth round trip. `startSSOFlow()` defaults its
 * redirect to `makeRedirectUri({ path: 'sso-callback' })`, so the provider
 * sends the app here when the browser sheet closes.
 *
 * The auth session usually swallows that redirect before it becomes real
 * navigation, but under Expo Go the deep link reaches the router instead, and
 * without a route to match it expo-router renders "Unmatched Route".
 *
 * There is nothing to do here but wait for Clerk to settle and bounce. The
 * session itself is activated by `setActive()` back on the sign-in screen.
 * `isLoaded` is checked before `isSignedIn` for the same reason as the auth
 * layout: reading it early would bounce to /sign-in mid-flow.
 */
export default function SSOCallback() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <View className="flex-1 bg-ground" />;

  return <Redirect href={isSignedIn ? "/" : "/sign-in"} />;
}
