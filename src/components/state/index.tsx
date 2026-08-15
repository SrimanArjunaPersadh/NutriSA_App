import { ActivityIndicator, Pressable, Text, View } from "react-native"

import { ApiError } from "@/lib/api"
import { colors } from "@/design/tokens"

/**
 * The three states every surface owes besides the happy one.
 *
 * plan.md's standing rule: "**Four states on every surface.** Empty, loading,
 * error, happy. No exceptions." These exist so that rule costs one import
 * rather than three ad-hoc blocks per card — which is how it gets skipped.
 *
 * They were deliberately not written in Phase 3. The note there said they
 * should be "written against a real consumer instead of speculatively", and the
 * dashboard is that consumer: five cards, each a different size, sharing a
 * layout that has to hold whether they are loading, empty or full.
 *
 * ## They fill their parent, they do not decide their own size
 *
 * Each one stretches to whatever it is placed in. That is what keeps a card's
 * height stable between states — a loading spinner in a box that collapses to
 * 40pt and then jumps to 260pt when the data lands is a page that moves under
 * the thumb, and on this screen it would move the quick-action bar.
 *
 * Callers therefore give the container its height. Every dashboard card already
 * does, because their charts needed fixed boxes anyway.
 */

/** Shared frame: centred, padded, and filling whatever it is put in. */
function StateFrame({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center px-[16px] py-[12px]">
      {children}
    </View>
  )
}

/**
 * Work in progress.
 *
 * A spinner and nothing else. It carries no label by default because these
 * appear inside cards that already have a heading — "WEIGHT TREND" above a
 * spinner reading "Loading weight trend…" says it twice — but `label` is there
 * for a full-screen use where nothing else on screen explains the wait.
 *
 * `accessibilityLabel` is set regardless, so VoiceOver announces the wait even
 * when nothing is drawn for it.
 */
export function Loading({ label }: { label?: string }) {
  return (
    <StateFrame>
      <ActivityIndicator
        color={colors.textSecondary}
        accessibilityLabel={label ?? "Loading"}
      />
      {label ? (
        <Text className="mt-[10px] text-center font-barlow text-[14px] text-textSecondary">
          {label}
        </Text>
      ) : null}
    </StateFrame>
  )
}

/**
 * Nothing here yet — and that is correct, not broken.
 *
 * The distinction this component exists to hold: an empty state describes the
 * *user's* data, an error state describes the *app*. "No weigh-ins yet" and
 * "Couldn't load your weigh-ins" look similar in a wireframe and mean opposite
 * things, and only one of them is worth retrying.
 *
 * `action` is optional because not every empty state has one. An empty weight
 * chart can offer "Log a weigh-in"; an empty insights row simply has nothing to
 * average yet, and a button there would be a dead end wearing a hat.
 */
export function Empty({
  title,
  detail,
  action,
}: {
  title: string
  detail?: string
  action?: { label: string; onPress: () => void }
}) {
  return (
    <StateFrame>
      <Text className="text-center font-barlow-semibold text-[16px] text-white">
        {title}
      </Text>
      {detail ? (
        <Text className="mt-[6px] text-center font-barlow text-[14px] text-textSecondary">
          {detail}
        </Text>
      ) : null}
      {action ? <StateButton label={action.label} onPress={action.onPress} /> : null}
    </StateFrame>
  )
}

/**
 * Something went wrong, said in words the user can act on.
 *
 * ## The message is chosen here, never forwarded from the server
 *
 * `ApiError.message` is for a log. It can be a Postgres string or a fetch
 * failure, and neither belongs on screen. So this maps the *code* to copy the
 * app owns, which is also what keeps the wording in the app's voice.
 *
 * Three of the codes deserve genuinely different sentences:
 *
 * - `network` — the phone or the tunnel. Retrying is the right move.
 * - `unauthenticated` — the session lapsed. Retrying will not help; signing in
 *   again will, and saying "try again" here would send the user in a circle.
 * - everything else — our bug. Say so plainly rather than blaming the network.
 */
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown
  onRetry?: () => void
}) {
  const { title, detail, retryable } = describe(error)

  return (
    <StateFrame>
      <Text className="text-center font-barlow-semibold text-[16px] text-white">
        {title}
      </Text>
      <Text className="mt-[6px] text-center font-barlow text-[14px] text-textSecondary">
        {detail}
      </Text>
      {retryable && onRetry ? <StateButton label="Try again" onPress={onRetry} /> : null}
    </StateFrame>
  )
}

/**
 * 44pt tall, which is the standing minimum and not a coincidence — this is the
 * only control the three states can offer, so it is the one that has to clear
 * the bar on every surface that uses them.
 */
function StateButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="mt-[14px] h-[44px] items-center justify-center rounded-[10px] border border-buttonBorder bg-secondary px-[20px] active:opacity-80"
    >
      <Text className="font-barlow-semibold text-[15px] text-white">{label}</Text>
    </Pressable>
  )
}

function describe(error: unknown): {
  title: string
  detail: string
  retryable: boolean
} {
  if (error instanceof ApiError) {
    switch (error.code) {
      /**
       * Developer-facing copy, deliberately.
       *
       * This state **cannot occur in a release build** — the API address is
       * inlined at build time, so a shipped app either has one or was never
       * built. It only appears during setup, and the only person who will ever
       * read it is the one who can fix it in ten seconds if told what is
       * wrong. "Something went wrong" here would be politeness that costs an
       * evening.
       */
      case "no-api-url":
        return {
          title: "App isn't configured",
          detail:
            "EXPO_PUBLIC_API_URL is missing from the bundle. Add it to .env, then restart Metro with: npm start -- --clear",
          retryable: false,
        }
      case "network":
        return {
          title: "Can't reach the server",
          detail: "Check your connection and try again.",
          retryable: true,
        }
      case "unauthenticated":
        return {
          title: "Your session has expired",
          detail: "Sign in again to see your data.",
          retryable: false,
        }
      case "not-found":
        return {
          title: "Nothing to show",
          detail: "That day could not be found.",
          retryable: false,
        }
      case "bad-request":
      case "malformed-response":
      case "server-error":
        return {
          title: "Something went wrong",
          detail: "This is a problem on our side, not yours.",
          retryable: true,
        }
    }
  }

  return {
    title: "Something went wrong",
    detail: "This is a problem on our side, not yours.",
    retryable: true,
  }
}
