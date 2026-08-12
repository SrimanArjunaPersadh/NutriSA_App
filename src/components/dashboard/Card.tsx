import { Text, View } from "react-native"

/**
 * The dashboard's surface: card ground, 16px radius, and a hairline that is the
 * only thing separating it from the app ground behind it — the two tokens are
 * five points apart in luminance, so without the border the cards disappear on
 * an OLED panel.
 */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <View
      className={`rounded-[16px] border border-cardBorder bg-card px-[16px] py-[18px] ${className}`}
    >
      {children}
    </View>
  )
}

/** The tracked, uppercase caption each card opens with. */
export function CardLabel({ children }: { children: string }) {
  return (
    <Text className="font-barlow-semibold text-[13px] tracking-[1.2px] text-textSecondary">
      {children}
    </Text>
  )
}
