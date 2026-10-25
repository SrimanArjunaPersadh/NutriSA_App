import { Pressable, ScrollView, Text, View } from "react-native"

import type { Macros } from "@engine"

import { formatKcal } from "@/lib/format"

import { AddButton, MacroCompact } from "./FoodRow"

/**
 * The logger's horizontal cards — `src/design/nutrition_tabs.jpeg`, first
 * screen: "Oats & Berries / 1 cup Oats / 1/3 cup Blueberries / 380 kcal /
 * P12g C56g F8g / +".
 *
 * One card for two things — a recent food and a saved meal — because the
 * reference draws its recents as exactly what this app calls saved meals, and
 * the two do the same job: the thing you had last time, one tap away. The
 * strip's heading says which is which.
 *
 * Same two targets as a row: the card opens it, `+` adds it.
 */
export function ShortcutCard({
  title,
  lines,
  macros,
  onOpen,
  onAdd,
  openLabel,
  addLabel,
}: {
  title: string
  /** Up to two short lines under the title — a serving, or a meal's items. */
  lines: readonly string[]
  macros: Macros
  onOpen: () => void
  onAdd: () => void
  openLabel: string
  addLabel: string
}) {
  return (
    // 176 wide, from 152: at 152 a line like "2 slices Albany Brown Bread"
    // lost its unit and the P / C / F line ran out of room (iPhone, 2026-10-20).
    <View className="w-[176px] rounded-[14px] border border-cardBorder bg-card">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={openLabel}
        onPress={onOpen}
        className="px-[12px] pt-[11px] active:opacity-70"
      >
        <Text numberOfLines={1} className="font-barlow-semibold text-[15px] text-white">
          {title}
        </Text>
        {/* Fixed height, so a one-line card and a two-line card align their numbers. */}
        <View className="mt-[2px] h-[34px]">
          {lines.slice(0, 2).map((line, index) => (
            <Text key={index} numberOfLines={1} className="font-barlow text-[12px] text-textSecondary">
              {line}
            </Text>
          ))}
        </View>
      </Pressable>

      <View className="flex-row items-end pb-[4px] pl-[12px]">
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no"
          onPress={onOpen}
          className="flex-1 pb-[6px]"
        >
          <Text className="font-barlow-bold text-[15px] text-white">{formatKcal(macros.kcal)} cal</Text>
          <MacroCompact macros={macros} />
        </Pressable>
        <AddButton label={addLabel} onPress={onAdd} />
      </View>
    </View>
  )
}

/** A heading and a horizontal row of cards. Renders nothing when empty. */
export function ShortcutStrip({
  heading,
  action,
  children,
  empty,
}: {
  heading: string
  action?: { label: string; onPress: () => void } | undefined
  children: React.ReactNode
  empty: boolean
}) {
  if (empty) return null

  return (
    <View className="mb-[18px]">
      <View className="mb-[2px] flex-row items-center">
        <Text className="flex-1 font-barlow-bold text-[17px] text-white">{heading}</Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            className="h-[44px] justify-center pl-[12px] active:opacity-70"
          >
            <Text className="font-barlow-medium text-[14px] text-link">{action.label}</Text>
          </Pressable>
        ) : (
          <View className="h-[44px]" />
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Bleeds to the screen edge so a half-visible card says "scroll me".
        className="-mx-[16px]"
        contentContainerClassName="gap-[10px] px-[16px]"
      >
        {children}
      </ScrollView>
    </View>
  )
}
