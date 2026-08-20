import { Text, TextInput, View } from "react-native"

import { colors } from "@/design/tokens"

/**
 * The form controls the manual entry surface is built from.
 *
 * Nothing here computes anything. They collect strings; `packages/engine/`
 * turns them into numbers. That split is why every value below is a `string`
 * and not a `number` — a field mid-edit holds "", "1.", "-" and other things
 * that are not numbers yet, and coercing them at the input's edge would either
 * fight the keyboard or silently rewrite what someone typed.
 *
 * ## Height is 44, everywhere, deliberately
 *
 * plan.md's standing rule is a 44×44pt minimum touch target. On a form that is
 * mostly inputs, the rule is really about the inputs — a 32pt field is the most
 * common way an app fails it, and it fails it on every row at once.
 */

/** The muted grey a placeholder is drawn in. A prop, not a class: RN takes a value. */
const PLACEHOLDER = colors.textSecondary

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-[6px] font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-textSecondary">
      {children}
    </Text>
  )
}

/**
 * A labelled line of text.
 *
 * `accessibilityLabel` falls back to the visible label, so VoiceOver reads a
 * field the same way a sighted user does. Passing it separately is for the
 * cases where the visible label is a shorthand the screen reader should expand.
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  autoFocus,
  maxLength,
}: {
  label: string
  value: string
  onChangeText: (next: string) => void
  placeholder?: string
  accessibilityLabel?: string
  autoFocus?: boolean
  maxLength?: number
}) {
  return (
    <View className="flex-1">
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER}
        accessibilityLabel={accessibilityLabel ?? label}
        autoFocus={autoFocus}
        maxLength={maxLength}
        // The app is dark only, so the platform's default light keyboard would
        // flash white every time a field is focused.
        keyboardAppearance="dark"
        className="h-[44px] rounded-[10px] border border-buttonBorder bg-secondary px-[12px] font-barlow text-[16px] text-white"
      />
    </View>
  )
}

/**
 * A number, collected as text.
 *
 * `keyboardType="decimal-pad"` rather than `numeric`: `numeric` on iOS includes
 * a minus sign and a comma, and a macro is never negative while a comma decimal
 * separator would not survive `Number()`. The pad still cannot stop a second
 * decimal point being typed, which is why the engine treats a non-finite
 * quantity as zero instead of trusting the keyboard.
 *
 * `suffix` is the unit, drawn inside the field. plan.md requires the unit label
 * to be visible; a value with its unit two controls away is the ambiguity that
 * rule exists to remove, and inside the box it cannot be scrolled away from the
 * number it belongs to.
 */
export function NumberField({
  label,
  value,
  onChangeText,
  suffix,
  accessibilityLabel,
}: {
  label: string
  value: string
  onChangeText: (next: string) => void
  suffix?: string
  accessibilityLabel?: string
}) {
  return (
    <View className="flex-1">
      <FieldLabel>{label}</FieldLabel>
      <View className="h-[44px] flex-row items-center rounded-[10px] border border-buttonBorder bg-secondary px-[12px]">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="0"
          placeholderTextColor={PLACEHOLDER}
          accessibilityLabel={accessibilityLabel ?? label}
          keyboardType="decimal-pad"
          keyboardAppearance="dark"
          className="h-full flex-1 font-barlow text-[16px] text-white"
        />
        {suffix ? (
          <Text className="ml-[6px] font-barlow text-[14px] text-textSecondary">
            {suffix}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
