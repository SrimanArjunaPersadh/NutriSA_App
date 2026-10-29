import { describe, expect, it } from "vitest"

import {
  FUZZY_WORD_THRESHOLD,
  MAX_SEARCH_WORDS,
  rankSearchCandidates,
  searchText,
  searchWords,
  wordSimilarity,
  wordsMatched,
  type SearchCandidate,
} from "./search"

describe("searchWords", () => {
  it("keeps the food in a sentence: the miss found on the iPhone", () => {
    expect(searchWords("a scoop of whey protein")).toEqual(["whey", "protein"])
  })

  it("drops numbers, with or without a unit", () => {
    expect(searchWords("2 eggs")).toEqual(["egg"])
    expect(searchWords("200g chicken breast")).toEqual(["chicken", "breast"])
    expect(searchWords("250 ml milk, 2x")).toEqual(["milk"])
  })

  it("drops punctuation and case", () => {
    expect(searchWords("USN: Hardcore-Whey!!")).toEqual(["usn", "hardcore", "whey"])
  })

  it("takes accents off", () => {
    expect(searchWords("Crème fraîche")).toEqual(["creme", "fraiche"])
    expect(searchText("Crème Fraîche, 250 ml")).toBe("creme fraiche 250 ml")
  })

  it("cuts a plural back so it still starts the singular", () => {
    expect(searchWords("tomatoes bananas oats")).toEqual(["tomato", "banana", "oat"])
    expect(searchWords("glass noodles")).toEqual(["noodl"])
  })

  it("keeps each word once", () => {
    expect(searchWords("whey Whey WHEY")).toEqual(["whey"])
  })

  it("is empty when everything is filler, which the server answers with recent foods", () => {
    expect(searchWords("a scoop of")).toEqual([])
    expect(searchWords("2 slices")).toEqual([])
    expect(searchWords("   ")).toEqual([])
  })

  it(`stops at ${MAX_SEARCH_WORDS} words`, () => {
    expect(searchWords("one apple pear plum grape kiwi mango melon lime")).toHaveLength(MAX_SEARCH_WORDS)
  })
})

describe("wordSimilarity", () => {
  it("is pg_trgm's word_similarity, as its docs work it", () => {
    // postgresql.org/docs/17/pgtrgm.html: word_similarity('word', 'two words') = 0.8
    expect(wordSimilarity("word", "two words")).toBe(0.8)
  })

  it("catches a typo and not a sound-alike", () => {
    expect(wordSimilarity("hardcroe", "USN Hardcore Whey")).toBeGreaterThan(0.5)
    expect(wordSimilarity("sourdogh", "Sourdough bread")).toBeGreaterThanOrEqual(FUZZY_WORD_THRESHOLD)
    // "way" for whey is the coach's to catch (Q34).
    expect(wordSimilarity("way", "USN Hardcore Whey")).toBeLessThan(FUZZY_WORD_THRESHOLD)
  })
})

describe("wordsMatched", () => {
  const whey = "USN Hardcore Whey"

  it("counts the words that start a word of the name", () => {
    expect(wordsMatched(["whey", "protein"], whey)).toBe(1)
    expect(wordsMatched(["usn"], whey)).toBe(1)
    expect(wordsMatched(["hard"], whey)).toBe(1)
    expect(wordsMatched(["whey", "hardcore"], whey)).toBe(2)
  })

  it("does not care about word order", () => {
    expect(wordsMatched(searchWords("whey hardcore"), whey)).toBe(wordsMatched(searchWords("hardcore whey"), whey))
  })

  it("forgives a typo", () => {
    expect(wordsMatched(searchWords("hardcor whey"), whey)).toBe(2)
    expect(wordsMatched(searchWords("brocoli"), "Broccoli, steamed")).toBe(1)
    // 0.5 against the 0.6 line, in Postgres too: a typo this early is the coach's.
    expect(wordsMatched(searchWords("chiken"), "Chicken breast, cooked")).toBe(0)
  })

  it("does not match the middle of a word", () => {
    // 0.5 in Postgres and here: "hey", "ey " are a run of Whey's, "  h" is not.
    expect(wordsMatched(["hey"], whey)).toBe(0)
    expect(wordsMatched(["ore"], whey)).toBe(0)
  })

  it("matches a plural against the singular and back", () => {
    expect(wordsMatched(searchWords("eggs"), "Large egg")).toBe(1)
    expect(wordsMatched(searchWords("egg"), "Eggs, boiled")).toBe(1)
  })

  it("ignores accents in the name", () => {
    expect(wordsMatched(searchWords("creme fraiche"), "Crème fraîche")).toBe(2)
  })

  it("finds nothing for an unrelated word", () => {
    expect(wordsMatched(searchWords("dragonfruit"), whey)).toBe(0)
  })
})

describe("rankSearchCandidates", () => {
  const candidate = (name: string, over: Partial<SearchCandidate> = {}): SearchCandidate => ({
    name,
    origin: "shared",
    wordsMatched: 1,
    timesLogged: 0,
    lastLogged: null,
    ...over,
  })

  it("puts more words matched first, over any history", () => {
    const ranked = rankSearchCandidates([
      candidate("Whey isolate", { timesLogged: 30, lastLogged: "2026-10-28", origin: "mine" }),
      candidate("USN Hardcore Whey", { wordsMatched: 2 }),
    ])
    expect(ranked.map((c) => c.name)).toEqual(["USN Hardcore Whey", "Whey isolate"])
  })

  it("then the food logged more often, then more lately", () => {
    const ranked = rankSearchCandidates([
      candidate("A", { timesLogged: 1, lastLogged: "2026-10-28" }),
      candidate("B", { timesLogged: 5, lastLogged: "2026-09-01" }),
      candidate("C", { timesLogged: 5, lastLogged: "2026-10-01" }),
      candidate("D"),
    ])
    expect(ranked.map((c) => c.name)).toEqual(["C", "B", "A", "D"])
  })

  it("then the user's own over shared over cached Open Food Facts", () => {
    const ranked = rankSearchCandidates([
      candidate("Milk", { origin: "off" }),
      candidate("Milk", { origin: "shared" }),
      candidate("Milk", { origin: "mine" }),
    ])
    expect(ranked.map((c) => c.origin)).toEqual(["mine", "shared", "off"])
  })

  it("then by name, the same way every time", () => {
    const names = ["oats", "Banana", "Apple", "Éclair", "banana"]
    const once = rankSearchCandidates(names.map((name) => candidate(name))).map((c) => c.name)
    const reversed = rankSearchCandidates([...names].reverse().map((name) => candidate(name))).map((c) => c.name)
    expect(once).toEqual(["Apple", "Banana", "banana", "Éclair", "oats"])
    expect(reversed).toEqual(once)
  })

  it("with no words matched anywhere, is the most-logged list", () => {
    const ranked = rankSearchCandidates([
      candidate("Rice", { wordsMatched: 0, timesLogged: 2, lastLogged: "2026-10-20" }),
      candidate("USN Hardcore Whey", { wordsMatched: 0, timesLogged: 9, lastLogged: "2026-10-28" }),
    ])
    expect(ranked[0]?.name).toBe("USN Hardcore Whey")
  })

  it("leaves its input alone", () => {
    const input = [candidate("B"), candidate("A")]
    rankSearchCandidates(input)
    expect(input.map((c) => c.name)).toEqual(["B", "A"])
  })
})
