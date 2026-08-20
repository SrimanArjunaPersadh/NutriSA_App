/**
 * A food emoji for a food's name.
 *
 * `src/design/nutrition_ui.png` puts a coloured emoji against every row and
 * every shortcut tile, and it is doing most of the work in that design: it is
 * the only colour in a near-black list, and it is what makes a row scannable
 * before you have read a word of it. A list of grey text rows is the same
 * screen with the life taken out.
 *
 * ## Why a keyword map and not a column
 *
 * Nothing stores an emoji. `foods` has no such field, the 38 migrated meals
 * certainly do not, and adding one would mean asking the user to pick a picture
 * every time they log a slice of bread. This is **presentation derived from the
 * name**, in the same category as `formatKcal` putting a comma in a thousand —
 * it never touches the stored row and nothing computes from it.
 *
 * ## Why it is allowed to be wrong
 *
 * It will be. "Orange Tomato" hits the tomato rule before the orange one and
 * that is the right answer; "Duck Breast" hits poultry; something unmatched
 * gets the plate. A wrong emoji costs nothing — the name is on the same line,
 * two points bigger, and it is what the user actually reads. So the rules are
 * ordered most-specific-first and the fallback is deliberately neutral rather
 * than clever.
 *
 * Emoji are safe here where a text arrow would not be (see `UiIcons.tsx`): the
 * system emoji font is always present on both platforms, so there is no tofu
 * risk. The one thing to avoid is emoji that render as text glyphs on Android
 * without a variation selector, which is why every entry below is a
 * pictographic codepoint rather than a dingbat.
 */

/**
 * Ordered rules. **The first match wins**, so the specific ones come first —
 * "tomato" must be tested before "potato" would ever be, and "sweet potato"
 * before "potato".
 */
const RULES: readonly (readonly [readonly string[], string])[] = [
  // Drinks first: "latte" and "shake" would otherwise be caught by dairy.
  [["latte", "cappuccino", "coffee", "espresso", "americano"], "☕"],
  [["tea", "rooibos", "chai"], "🍵"],
  [["smoothie", "shake", "milkshake"], "🥤"],
  [["juice", "cordial", "squash"], "🧃"],
  [["beer", "cider", "lager"], "🍺"],
  [["wine", "shiraz", "pinotage"], "🍷"],
  [["cocktail", "margarita", "mojito"], "🍹"],
  [["water", "sparkling"], "💧"],

  // Fruit.
  [["tomato"], "🍅"],
  [["orange", "naartjie", "clementine", "mandarin"], "🍊"],
  [["banana"], "🍌"],
  [["apple"], "🍎"],
  [["grape"], "🍇"],
  [["strawberr", "berry", "berries"], "🍓"],
  [["watermelon"], "🍉"],
  [["pineapple"], "🍍"],
  [["mango"], "🥭"],
  [["peach", "nectarine"], "🍑"],
  [["pear"], "🍐"],
  [["lemon", "lime"], "🍋"],
  [["avocado", "guacamole"], "🥑"],
  [["coconut"], "🥥"],
  [["melon", "spanspek"], "🍈"],

  // Vegetables.
  [["sweet potato"], "🍠"],
  [["potato", "chips", "fries", "slap chips"], "🥔"],
  [["carrot"], "🥕"],
  [["broccoli"], "🥦"],
  [["corn", "mielie", "sweetcorn"], "🌽"],
  [["pepper", "capsicum"], "🫑"],
  [["cucumber", "gherkin"], "🥒"],
  [["onion"], "🧅"],
  [["garlic"], "🧄"],
  [["mushroom"], "🍄"],
  [["lettuce", "salad", "spinach", "cabbage", "morogo", "greens"], "🥬"],
  [["aubergine", "brinjal", "eggplant"], "🍆"],

  // Protein.
  [["chicken", "duck", "turkey", "poultry", "drumstick", "wing"], "🍗"],
  [["steak", "beef", "biltong", "mince", "lamb", "chop"], "🥩"],
  [["bacon", "pork", "rasher"], "🥓"],
  [["boerewors", "wors", "sausage", "hotdog", "hot dog", "russian"], "🌭"],
  [["prawn", "shrimp"], "🍤"],
  [["fish", "hake", "salmon", "tuna", "snoek", "sardine"], "🐟"],
  [["egg"], "🥚"],
  [["tofu", "soya", "soy"], "🧊"],
  [["bean", "lentil", "chickpea", "samp"], "🫘"],
  [["nut", "peanut", "almond", "cashew"], "🥜"],

  // Carbs and staples.
  [["rice", "risotto"], "🍚"],
  [["pasta", "spaghetti", "macaroni", "noodle", "lasagne", "lasagna"], "🍝"],
  [["bread", "toast", "roll", "slice", "sandwich", "vetkoek"], "🍞"],
  [["pap", "porridge", "oats", "maize", "polenta", "mieliepap"], "🥣"],
  [["cereal", "muesli", "granola"], "🥣"],
  [["wrap", "tortilla", "roti", "burrito"], "🌯"],
  [["pizza"], "🍕"],
  [["burger"], "🍔"],
  [["taco"], "🌮"],
  [["curry", "bunny chow", "stew", "potjie", "soup"], "🍛"],
  [["pie"], "🥧"],

  // Dairy.
  [["cheese", "cheddar", "feta", "mozzarella"], "🧀"],
  [["yoghurt", "yogurt", "amasi"], "🥛"],
  [["milk", "cream"], "🥛"],
  [["butter", "margarine"], "🧈"],

  // Sweet.
  [["chocolate", "choc"], "🍫"],
  [["ice cream", "gelato"], "🍦"],
  [["cake", "flan", "custard", "malva", "pudding", "tart"], "🍰"],
  [["biscuit", "cookie", "rusk"], "🍪"],
  [["doughnut", "donut", "koeksister"], "🍩"],
  [["sweet", "lolly", "candy", "gum"], "🍬"],
  [["honey", "syrup", "jam"], "🍯"],
  [["popcorn"], "🍿"],
  [["crisps", "nik naks", "snack"], "🥨"],
  [["protein bar", "bar"], "🍫"],
  [["oil", "olive"], "🫒"],
] as const

/** What an unmatched name gets. Neutral on purpose — a wrong guess is worse. */
export const FALLBACK_FOOD_EMOJI = "🍽️"

export function foodEmoji(name: string): string {
  const haystack = name.toLowerCase()
  for (const [needles, emoji] of RULES) {
    for (const needle of needles) {
      if (haystack.includes(needle)) return emoji
    }
  }
  return FALLBACK_FOOD_EMOJI
}
