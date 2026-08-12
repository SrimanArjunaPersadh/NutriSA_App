import { useCallback, useState } from "react"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
import { Image } from "expo-image"
import { LinearGradient } from "expo-linear-gradient"
import { StatusBar } from "expo-status-bar"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useSSO } from "@clerk/expo"

import bgImage from "@/design/auth_screen_bg.webp"
import { AppleIcon, GoogleIcon } from "@/components/icons/BrandIcons"
import { BarsIcon, InsightIcon, TargetIcon } from "@/components/icons/FeatureIcons"
import { colors, withAlpha } from "@/design/tokens"

type Provider = "oauth_google" | "oauth_apple"

/**
 * The scrim over the photo. Five stops, opacity climbing to near-opaque at the
 * bottom so the buttons and terms sit on flat ground rather than on the image.
 *
 * The base is `authGradientBase`, not `ground` — two points darker, sampled
 * from the reference. `as const` because LinearGradient's `colors` prop wants a
 * tuple of at least two, and a mapped array widens to string[].
 */
const SCRIM = [
  withAlpha(colors.authGradientBase, 0.26),
  withAlpha(colors.authGradientBase, 0.38),
  withAlpha(colors.authGradientBase, 0.74),
  withAlpha(colors.authGradientBase, 0.9),
  withAlpha(colors.authGradientBase, 0.96),
] as const

/**
 * Vertical rhythm below is traced from src/design/auth_ui_design.png. The
 * reference render is ~910pt tall against 852pt on an iPhone 15 Pro, so every
 * gap from the wordmark down is fixed and the photo area above it absorbs the
 * difference via the flex-1 spacer.
 */
export default function SignIn() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { startSSOFlow } = useSSO()
  const [pending, setPending] = useState<Provider | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const signInWith = useCallback(
    async (strategy: Provider) => {
      if (pending) return
      setPending(strategy)
      setNotice(null)
      try {
        // SSO is the one Clerk flow that still activates the session by hand;
        // the transfer between sign-in and sign-up happens inside startSSOFlow.
        const { createdSessionId, setActive, signUp } = await startSSOFlow({ strategy })

        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId })
          router.replace("/")
          return
        }

        if (signUp?.status === "missing_requirements") {
          // The instance wants a field the provider didn't return. Progressive
          // sign-up is on and only email is required, so Google and Apple should
          // never land here — but a dashboard change could reintroduce it, and a
          // silent no-op would look like a dead button.
          setNotice("We need a little more information to finish your account.")
          return
        }

        // No session and no missing requirements means the user dismissed the
        // browser sheet. Cancelling is not an error, so say nothing.
      } catch (err) {
        // Dev-only: a Clerk error object can carry the user's email address, and
        // Sentry breadcrumbs pick console output up in release builds.
        if (__DEV__) console.error("SSO error:", JSON.stringify(err, null, 2))
        setNotice("We couldn't sign you in. Please try again.")
      } finally {
        setPending(null)
      }
    },
    [pending, router, startSSOFlow],
  )

  return (
    <View className="flex-1 bg-ground">
      <StatusBar style="light" />

      <Image source={bgImage} contentFit="cover" className="absolute inset-0 h-full w-full" />
      <LinearGradient
        colors={SCRIM}
        locations={[0, 0.2, 0.4, 0.58, 1]}
        // Explicit start/end — the default axis is horizontal.
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        className="absolute inset-0 h-full w-full"
      />

      <View
        className="flex-1"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 11.4 }}
      >
        {/* Photo showcase — the only flexible band on the screen. */}
        <View className="flex-1" />

        {/*
          The reference wordmark is 240pt wide with a 78.6pt cap height — a
          ratio of 3.05. Barlow Condensed 800 Italic sits at 3.82, so it is set
          at the size that matches the cap height and squeezed to 0.8 on x,
          which measures 240pt of ink against the reference's 240.4pt.
        */}
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          className="text-center font-display text-[112px] leading-[112px] text-white"
          style={{ transform: [{ scaleX: 0.8 }] }}
        >
          Nutri<Text className="text-primary">SA</Text>
        </Text>

        <View className="mt-[12.8px] h-[1px] w-[52px] self-center bg-primary" />

        <Text className="mt-[17px] text-center font-barlow-bold text-[16px] leading-[23.5px] text-white/90">
          {"Evidence based nutrition and\nbody recomposition tracking."}
        </Text>

        <SocialButton
          className="mt-[34.7px]"
          label="Continue with Google"
          icon={<GoogleIcon size={28} />}
          busy={pending === "oauth_google"}
          disabled={pending !== null}
          onPress={() => signInWith("oauth_google")}
        />

        <View className="mx-[44.5px] my-[12.2px] h-[20px] flex-row items-center">
          <View className="h-[1px] flex-1 bg-white/35" />
          <Text className="mx-[36px] font-barlow-semibold text-[12px] leading-[20px] tracking-[1px] text-white/70">
            OR
          </Text>
          <View className="h-[1px] flex-1 bg-white/35" />
        </View>

        <SocialButton
          label="Continue with Apple"
          icon={<AppleIcon height={26} />}
          busy={pending === "oauth_apple"}
          disabled={pending !== null}
          onPress={() => signInWith("oauth_apple")}
        />

        {/*
          Zero-height anchor for the sign-in error. Absolute, so a message never
          shifts the feature row and terms below it. Google and Apple are the
          only providers, so this is the screen's one error surface.
        */}
        <View className="h-0">
          {notice ? (
            <Text className="absolute left-0 right-0 top-[10px] px-[24px] text-center font-barlow text-[13px] text-danger">
              {notice}
            </Text>
          ) : null}
        </View>

        <View className="mt-[39.6px] flex-row px-[24px]">
          <Feature icon={<TargetIcon />} label={"Track with\nprecision"} />
          <View className="w-[1px] self-stretch bg-white/20" />
          <Feature icon={<BarsIcon />} label={"See what\nmatters"} />
          <View className="w-[1px] self-stretch bg-white/20" />
          <Feature icon={<InsightIcon />} label={"Make better\ndecisions"} />
        </View>

        <Text className="mt-[33.3px] text-center font-barlow text-[12px] leading-[18.4px] text-white/85">
          By continuing, you agree to the{"\n"}
          <Text className="text-link">Terms of Service</Text> and{" "}
          <Text className="text-link">Privacy Policy.</Text>
        </Text>
      </View>
    </View>
  )
}

function SocialButton({
  label,
  icon,
  onPress,
  busy,
  disabled,
  className = "",
}: {
  label: string
  icon: React.ReactNode
  onPress: () => void
  busy: boolean
  disabled: boolean
  className?: string
}) {
  return (
    <Pressable
      className={`mx-[44.5px] h-[55px] flex-row items-center rounded-[10px] bg-white px-[21px] active:opacity-90 ${className}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled }}
    >
      <View className="h-[28px] w-[28px] items-center justify-center">{icon}</View>
      {busy ? (
        <View className="flex-1 items-center">
          {/* Named colour, not a hex — the button is white and the spinner
              pairs with the `text-black` label it replaces. */}
          <ActivityIndicator color="black" />
        </View>
      ) : (
        <Text className="flex-1 text-center font-barlow-semibold text-[17px] text-black">
          {label}
        </Text>
      )}
    </Pressable>
  )
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View className="flex-1 items-center">
      <View className="h-[22px] w-[22px] items-center justify-center">{icon}</View>
      <Text className="mt-[8.6px] text-center font-barlow-medium text-[12px] leading-[16px] text-white">
        {label}
      </Text>
    </View>
  )
}
