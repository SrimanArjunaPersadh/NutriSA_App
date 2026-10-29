/**
 * Food search: which foods a query finds, and in what order (plan.md, branch
 * `food-search`, Q31, Q32).
 *
 * ## Why this is here
 *
 * The order of a search list is a number the user sees: the first row is the
 * one a tap logs. Every such number comes from this package. The server's SQL
 * only fetches candidates; whether a candidate matches, and where it sits, is
 * decided here, for the `foods` rows and the user's logged meal lines alike.
 * One function for both halves, so the two can never disagree about what
 * "whey" finds.
 *
 * ## The match, in words
 *
 * The query is split into words and its filler dropped ("a scoop of whey
 * protein" is `whey`, `protein`). A food matches when **any** word starts a
 * word of its name ("hard" finds Hardcore; the brand is part of the name, so
 * "usn" finds USN), or is close to one by trigrams, for a typo ("hardcroe").
 * Accents are ignored both ways. A sound-alike ("way" for "whey") or a synonym
 * is not caught here: trigram similarity of "way" and "whey" is 0.125. That is
 * the coach's job (Q34).
 *
 * ## Trigrams, as Postgres counts them
 *
 * `wordSimilarity` is `pg_trgm`'s `word_similarity`: the query word's
 * trigrams against the best run of consecutive trigrams in the name, scored
 * as shared / (the word's + the run's - shared). Measured on the `test`
 * branch, 2026-10-29: "chiken" against "chicken breast, cooked" is 0.5, the
 * whole of "chicken" being the best run (5 shared of 7 and 8). The server's
 * candidate query uses the database's `<%` at its default threshold, 0.6,
 * which is `FUZZY_WORD_THRESHOLD`, so the database fetches what this accepts
 * and the two cannot disagree about a typo. `tests/security/food-search.test.ts`
 * compares them on real Postgres.
 *
 * So 0.6 catches "sourdogh" (0.67) and "brocoli" (0.7), not "chiken" or
 * "yogurt" for yoghurt (both 0.5). Lowering it means setting
 * `pg_trgm.word_similarity_threshold` for the database, which is a choice
 * for Sriman, not a default (handoff, `food-search`).
 */

/**
 * Words that carry no food: articles, amounts, containers, units.
 *
 * Plan.md's list (a, of, some, my, scoop, cup, slice, g, ml) and their
 * neighbours. A word that could be a food on its own ("glass" noodles aside)
 * stays out of this list; dropping a real food word is worse than keeping a
 * filler one, which only finds too much.
 */
export const SEARCH_FILLER_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "of", "some", "my", "and", "with", "for", "i", "had", "ate", "just",
  "half", "one", "two", "three", "four", "few", "couple", "bit", "little",
  "scoop", "scoops", "cup", "cups", "slice", "slices", "piece", "pieces",
  "serving", "servings", "portion", "portions", "bowl", "bowls", "glass", "glasses",
  "handful", "tbsp", "tsp", "tablespoon", "tablespoons", "teaspoon", "teaspoons",
  "g", "gram", "grams", "kg", "mg", "ml", "l", "litre", "litres", "liter", "liters",
  "oz", "x", "kcal", "cal",
])

/** "200g", "2x", "500ml", "3": a number, with or without a unit. */
const AMOUNT = /^\d+(g|kg|mg|ml|l|x|oz|kcal|cal)?$/

/** At most this many words reach the database. A sentence is not a search. */
export const MAX_SEARCH_WORDS = 6

/** `pg_trgm.word_similarity_threshold`'s default, which `<%` reads. */
export const FUZZY_WORD_THRESHOLD = 0.6

/**
 * Text as search compares it: lower case, accents off ("Crème" is "creme"),
 * every run of letters and digits a word, one space between. The same as the
 * database's `nutrisa_unaccent(lower(name))` for the purpose of matching.
 */
export function searchText(text: string): string {
  return words(text).join(" ")
}

/**
 * The words a query searches for: filler and amounts dropped, a plural cut
 * back to its stem ("eggs" → egg, "tomatoes" → tomato) so it still starts the
 * singular, duplicates removed. Empty when nothing is left, which the server
 * answers with the user's recent foods.
 */
export function searchWords(query: string): string[] {
  const found: string[] = []
  for (const word of words(query)) {
    if (SEARCH_FILLER_WORDS.has(word) || AMOUNT.test(word)) continue
    const stem = singular(word)
    if (!found.includes(stem)) found.push(stem)
    if (found.length === MAX_SEARCH_WORDS) break
  }
  return found
}

/**
 * How many of the query's words a name holds: each word counts once, when it
 * starts a word of the name or is a typo away from one. Zero is no match.
 */
export function wordsMatched(searchWordList: readonly string[], name: string): number {
  const nameWords = words(name)
  let matched = 0
  for (const word of searchWordList) {
    if (nameWords.some((nameWord) => nameWord.startsWith(word))) matched += 1
    else if (similarity(word, nameWords) >= FUZZY_WORD_THRESHOLD) matched += 1
  }
  return matched
}

/**
 * `pg_trgm`'s `word_similarity(word, text)`, from 0 to 1. Each word is padded
 * with two spaces in front and one behind before it is cut into threes, as
 * Postgres does, so "whey" is `  w`, ` wh`, `whe`, `hey`, `ey `.
 */
export function wordSimilarity(word: string, text: string): number {
  return similarity(searchText(word), words(text))
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/** Where a candidate came from: the user's own, the shared list, a cached Open Food Facts product. */
export type SearchOrigin = "mine" | "shared" | "off"

const ORIGIN_ORDER: Record<SearchOrigin, number> = { mine: 0, shared: 1, off: 2 }

export type SearchCandidate = {
  name: string
  origin: SearchOrigin
  /** From `wordsMatched`. */
  wordsMatched: number
  /** Meals in the last 90 days that held this food. */
  timesLogged: number
  /** The newest of those meals' days, `YYYY-MM-DD`, or null. */
  lastLogged: string | null
}

/**
 * The search order (Q32): more of the query's words first; then the food the
 * user logs more often, then more recently; then their own over the shared
 * list over cached Open Food Facts; then by name, so equal rows always come
 * out the same way. A new array; the input is left alone.
 *
 * With every `wordsMatched` at zero this is "your most-logged foods", which is
 * what the coach is handed when a search finds nothing (Q33 c).
 */
export function rankSearchCandidates<T extends SearchCandidate>(candidates: readonly T[]): T[] {
  return [...candidates].sort(
    (a, b) =>
      b.wordsMatched - a.wordsMatched ||
      b.timesLogged - a.timesLogged ||
      compareDays(b.lastLogged, a.lastLogged) ||
      ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin] ||
      compareText(searchText(a.name), searchText(b.name)) ||
      compareText(a.name, b.name),
  )
}

// ---------------------------------------------------------------------------

function words(text: string): string[] {
  return (
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  )
}

/**
 * Cut a plural back far enough that it starts the singular. Over-cutting is
 * harmless because the match is by prefix: "noodles" → "noodl" still starts
 * "noodle", and "hummus" → "hummu" still starts "hummus". Short words and
 * "ss" endings ("glass") are left.
 */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1)
  return word
}

/** A word's trigrams in order, as `pg_trgm` cuts them. */
function trigramList(word: string): string[] {
  const padded = `  ${word} `
  const grams: string[] = []
  for (let start = 0; start + 3 <= padded.length; start += 1) grams.push(padded.slice(start, start + 3))
  return grams
}

/**
 * The best score of `word` against any run of consecutive trigrams of
 * `textWords`, each run scored as shared / (word's + run's - shared), counting
 * distinct trigrams. A run that starts or ends on a trigram the word lacks only
 * scores lower, so only runs between two shared trigrams are tried.
 */
function similarity(word: string, textWords: readonly string[]): number {
  const own = new Set(words(word).flatMap(trigramList))
  if (own.size === 0) return 0
  const text = textWords.flatMap(trigramList)

  let best = 0
  for (let start = 0; start < text.length; start += 1) {
    if (!own.has(text[start]!)) continue
    const run = new Set<string>()
    let shared = 0
    for (let end = start; end < text.length; end += 1) {
      const gram = text[end]!
      if (!run.has(gram)) {
        run.add(gram)
        if (own.has(gram)) shared += 1
      }
      if (own.has(gram)) best = Math.max(best, shared / (own.size + run.size - shared))
    }
  }
  return best
}

function compareDays(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a < b ? -1 : 1
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
