/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Fixed token table — plan.md. Dark only, no light theme.
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
