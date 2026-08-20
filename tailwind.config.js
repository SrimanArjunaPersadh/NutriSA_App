/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Shadows Tailwind's built-in `white` with the same value, so that
        // `src/design/tokens.ts` can expose it to react-native-svg and the
        // two palettes still agree in both directions. See tokens.test.ts.
        white: "#FFFFFF",
        // Fixed token table — plan.md. Dark only, no light theme.
        //
        // This block is a hand-maintained copy of `src/design/tokens.ts`; a .js
        // config cannot require a .ts module. `tests/tokens.test.ts` asserts the
        // two agree in both directions, so adding a colour to one and forgetting
        // the other fails `npm test` rather than shipping.
        ground: "#0D0F14",
        card: "#13161E",
        secondary: "#1A1E29",
        primary: "#0066FF",
        // Slightly brighter blue the reference uses for inline text links.
        link: "#1A7CFC",
        ok: "#22C55E",
        danger: "#FF3B30",
        amber: "#F59E0B",
        protein: "#A78BFA",
        carbs: "#FCD34D",
        fats: "#2DD4BF",

        // Neutrals, promoted from bare hex literals that were already in use.
        // Exposed here as well as in tokens.ts so a className site never has to
        // fall back to an arbitrary value like `text-[#8A8F98]`.
        textSecondary: "#8A8F98",
        dotMuted: "#6E7686",
        hairline: "#1E222B",
        cardBorder: "#20242D",
        buttonBorder: "#2A2F3B",
        ringTrack: "#252A35",

        // Sign-in scrim base — see the note on the token in tokens.ts.
        authGradientBase: "#090B10",
      },
      fontFamily: {
        // React Native resolves a font by family name only — never pair these
        // with font-bold / italic utilities, the file already carries the weight.
        display: ["BarlowCondensed_800ExtraBold_Italic"],
        barlow: ["Barlow_400Regular"],
        "barlow-medium": ["Barlow_500Medium"],
        "barlow-semibold": ["Barlow_600SemiBold"],
        "barlow-bold": ["Barlow_700Bold"],
      },
    },
  },
  plugins: [],
}
