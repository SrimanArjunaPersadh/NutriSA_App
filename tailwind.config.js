/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Shadows Tailwind's built-in `white` with the palette's warm off-white
        // (Graphite & Copper, 2026-10-20), so `text-white` / `bg-white` follow
        // the theme. True white is `pureWhite`. See tokens.ts and tokens.test.ts.
        white: "#F3EFE9",
        // Fixed token table — plan.md. Dark only, no light theme.
        //
        // This block is a hand-maintained copy of `src/design/tokens.ts`; a .js
        // config cannot require a .ts module. `tests/tokens.test.ts` asserts the
        // two agree in both directions, so adding a colour to one and forgetting
        // the other fails `npm test` rather than shipping.
        ground: "#131211",
        card: "#1C1B19",
        secondary: "#262422",
        primary: "#D08A5A",
        // Inline text links. The same copper as primary since 2026-10-20.
        link: "#D08A5A",
        ok: "#9DB89A",
        danger: "#E5614C",
        amber: "#E3A44A",
        protein: "#4C8DFF",
        carbs: "#FFC21A",
        fats: "#F0468F",

        // Neutrals, promoted from bare hex literals that were already in use.
        // Exposed here as well as in tokens.ts so a className site never has to
        // fall back to an arbitrary value like `text-[#8A8F98]`.
        textSecondary: "#A19A91",
        dotMuted: "#7A736B",
        hairline: "#2B2926",
        cardBorder: "#262422",
        buttonBorder: "#36332F",
        ringTrack: "#34312D",

        // True white for the sign-in brand buttons and product-photo bands.
        pureWhite: "#FFFFFF",

        // Sign-in scrim base — see the note on the token in tokens.ts.
        authGradientBase: "#0E0D0C",
      },
      fontFamily: {
        // React Native resolves a font by family name only — never pair these
        // with font-bold / italic utilities, the file already carries the weight.
        display: ["BarlowCondensed_800ExtraBold_Italic"],
        barlow: ["Barlow_400Regular"],
        "barlow-medium": ["Barlow_500Medium"],
        "barlow-semibold": ["Barlow_600SemiBold"],
        "barlow-bold": ["Barlow_700Bold"],
        // The AI chat only (plan.md, Phase 9, C1, Sriman's pick 2026-10-29):
        // the coach's replies read in a serif, the user's words and the box in
        // Inter, so the two voices never look alike. Not for anything else.
        reply: ["SourceSerif4_400Regular"],
        chat: ["Inter_400Regular"],
      },
    },
  },
  plugins: [],
}
