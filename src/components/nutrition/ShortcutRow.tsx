import { Pressable, ScrollView, Text, View } from "react-native"

import { foodEmoji } from "@/lib/food-emoji"

/**
 * The row of one-tap foods under the mode tabs — `src/design/nutrition_ui.png`.
 *
 * A circular emoji tile with a `+` badge, a short label under it, scrolling
 * sideways off the right edge. In the reference these are saved meals and
 * recent foods: the things you eat often enough that searching for them again
 * is an insult.
 *
 * ## It breaks the gutter on purpose
 *
 * The row scrolls edge to edge and applies the 16pt gutter *inside* its own
 * content, the same arrangement as the dashboard's `WeekStrip` and
 * `InsightsSection`. A padded wrapper would stop the last tile short of the
 * screen edge and kill the "there is more over here" cue that makes a
 * horizontal row look scrollable at all.
 *
 * ## What it is fed today
 *
 * The day's own logged meals, most recent first — which is real data, is
 * genuinely useful (yesterday's breakfast is usually today's), and needs no
 * route that does not exist. The reference's version draws on `custom_meals`
 * and a frequency count over `foods`; both arrive in Phase 6, and this row is
 * the surface they will land in.
 */

export type Shortcut = {
  id: string
  label: string
}

const TILE = 54

export function ShortcutRow({
  shortcuts,
  onAdd,
}: {
  shortcuts: readonly Shortcut[]
  /** Undefined while nothing can be added — the tiles then read as disabled. */
  onAdd?: ((shortcut: Shortcut) => void) | undefined
}) {
  if (shortcuts.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
    >
      {shortcuts.map((shortcut) => (
        <Pressable
          key={shortcut.id}
          accessibilityRole="button"
          accessibilityLabel={`Log ${shortcut.label} again`}
          accessibilityState={{ disabled: !onAdd }}
          disabled={!onAdd}
          onPress={() => onAdd?.(shortcut)}
          className="items-center active:opacity-70"
          style={{ width: 68 }}
        >
          <View>
            <View
              className="items-center justify-center rounded-full bg-secondary"
              style={{ width: TILE, height: TILE }}
            >
              {/*
                Emoji at 26pt inside a 54pt tile. `lineHeight` is set explicitly
                because an emoji's default line box is taller than its glyph on
                Android, which pushes it off-centre in a fixed-height circle.
              */}
              <Text style={{ fontSize: 26, lineHeight: 32 }}>
                {foodEmoji(shortcut.label)}
              </Text>
            </View>

            {/*
              The badge overlaps the tile's top-right corner, as in the
              reference. `border-ground` rather than no border: without a ring
              in the page colour the badge and the tile merge into one blob at
              this size.
            */}
            <View
              accessible={false}
              className="absolute -right-[2px] -top-[2px] h-[20px] w-[20px] items-center justify-center rounded-full border-2 border-ground bg-primary"
            >
              <Text className="font-barlow-bold text-[12px] leading-[14px] text-white">
                +
              </Text>
            </View>
          </View>

          <Text
            numberOfLines={1}
            // Not focusable on its own: the Pressable above already announces
            // "Log <label> again", and a separate text node would make VoiceOver
            // read the name twice per tile.
            accessible={false}
            className="mt-[7px] text-center font-barlow text-[11px] text-textSecondary"
          >
            {shortcut.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}
