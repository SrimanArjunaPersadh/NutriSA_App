import { describe, expect, it } from "vitest"

import type { Food as FoodRow } from "../server/db/schema"
import { foodDisplayName as displayName } from "@shared"

import {
  foodFromOff,
  foodFromRow,
  likePattern,
  readMealItems,
  recentFoodsFromMeals,
  rowValuesFromFood,
  storedItemFromWrite,
} from "../server/food/rows"

/**
 * The product API's answer for Koo baked beans, trimmed to the fields asked
 * for. Probed against world.openfoodfacts.org on 2026-10-19.
 */
const KOO_PRODUCT = {
  code: "6009522310363",
  product_name: "Baked Beans in Tomato Sauce",
  brands: "KOO",
  product_quantity_unit: "g",
  serving_quantity: 20,
  serving_size: "20 g",
  nutriments: {
    "energy-kcal_100g": 95,
    "energy-kj_100g": 396,
    proteins_100g: 5,
    carbohydrates_100g: 16.5,
    fat_100g: 0.5,
  },
}

function row(overrides: Partial<FoodRow>): FoodRow {
  return {
    id: "0190f2a8-0000-7000-8000-000000000001",
    userId: "user_a",
    name: "Brown bread",
    cat: null,
    unit: "g",
    defaultQty: null,
    per100: { kcal: 230, pro: 9, carb: 40, fat: 3 },
    perUnit: null,
    unitLabel: null,
    barcode: null,
    source: "manual",
    createdAt: new Date(0),
    ...overrides,
  }
}

describe("foodFromOff", () => {
  it("reads a complete product", () => {
    expect(foodFromOff(KOO_PRODUCT)).toEqual({
      id: null,
      name: "Baked Beans in Tomato Sauce",
      brand: "KOO",
      barcode: "6009522310363",
      origin: "off",
      unit: "g",
      per: { kcal: 95, protein: 5, carbs: 16.5, fat: 0.5 },
      serving: { quantity: 20, label: "20 g" },
      imageUrl: null,
    })
  })

  it("passes through a photo on OFF's own image host, and nothing else", () => {
    const url = "https://images.openfoodfacts.org/images/products/600/952/231/0363/front_en.27.400.jpg"
    expect(foodFromOff({ ...KOO_PRODUCT, image_front_url: url })?.imageUrl).toBe(url)
    expect(foodFromOff({ ...KOO_PRODUCT, image_front_url: "https://evil.example/x.jpg" })?.imageUrl).toBeNull()
    expect(
      foodFromOff({ ...KOO_PRODUCT, image_front_url: url.replace("https", "http") })?.imageUrl,
    ).toBeNull()
  })

  it("takes search-a-licious's array of brands as well as the product API's string", () => {
    expect(foodFromOff({ ...KOO_PRODUCT, brands: ["Koo", "Tiger Brands"] })?.brand).toBe("Koo")
    expect(foodFromOff({ ...KOO_PRODUCT, brands: "Koo, Tiger Brands" })?.brand).toBe("Koo")
    expect(foodFromOff({ ...KOO_PRODUCT, brands: undefined })?.brand).toBeNull()
  })

  it("converts kJ when the record carries no kcal — common on SA labels", () => {
    const { "energy-kcal_100g": _, ...kjOnly } = KOO_PRODUCT.nutriments
    expect(foodFromOff({ ...KOO_PRODUCT, nutriments: { ...kjOnly, "energy-kj_100g": 500 } })?.per.kcal).toBe(120)
  })

  it("prefers the printed kcal over a conversion", () => {
    expect(foodFromOff(KOO_PRODUCT)?.per.kcal).toBe(95)
  })

  it.each(["proteins_100g", "carbohydrates_100g", "fat_100g"] as const)(
    "refuses a product missing %s rather than calling it zero",
    (key) => {
      const { [key]: _, ...rest } = KOO_PRODUCT.nutriments
      expect(foodFromOff({ ...KOO_PRODUCT, nutriments: rest })).toBeNull()
    },
  )

  it("refuses a product with no energy at all", () => {
    const { "energy-kcal_100g": _a, "energy-kj_100g": _b, ...rest } = KOO_PRODUCT.nutriments
    expect(foodFromOff({ ...KOO_PRODUCT, nutriments: rest })).toBeNull()
  })

  it("refuses a product with no name or no usable barcode", () => {
    expect(foodFromOff({ ...KOO_PRODUCT, product_name: "  " })).toBeNull()
    expect(foodFromOff({ ...KOO_PRODUCT, code: "https://example.com" })).toBeNull()
    expect(foodFromOff(null)).toBeNull()
  })

  it("accepts a numeric-string serving quantity", () => {
    expect(foodFromOff({ ...KOO_PRODUCT, serving_quantity: "30" })?.serving.quantity).toBe(30)
  })

  it("falls back to 100 when the label gives no serving", () => {
    const food = foodFromOff({ ...KOO_PRODUCT, serving_quantity: undefined, serving_size: undefined })
    expect(food?.serving).toEqual({ quantity: 100, label: null })
  })

  it("takes a measure from a serving that names a thing", () => {
    const food = foodFromOff({ ...KOO_PRODUCT, product_name: "Superior White Bread", serving_quantity: 35, serving_size: "1 slice (35 g)" })
    expect(food).toMatchObject({ serving: { quantity: 35, label: "1 slice (35 g)" }, measure: { noun: "slice", grams: 35 } })
  })

  it("offers a common food by its natural unit when the label has no serving", () => {
    const food = foodFromOff({ ...KOO_PRODUCT, product_name: "Bananas", serving_quantity: undefined, serving_size: undefined })
    expect(food).toMatchObject({ serving: { quantity: 118, label: null }, measure: { noun: "banana", grams: 118 } })
  })

  it("quotes liquids per 100 ml", () => {
    expect(foodFromOff({ ...KOO_PRODUCT, product_quantity_unit: "ml" })?.unit).toBe("ml")
  })
})

describe("foodFromRow", () => {
  it("maps a per-100 row of the user's own", () => {
    expect(foodFromRow(row({ name: "Chicken mayo" }))).toMatchObject({
      origin: "mine",
      unit: "g",
      per: { kcal: 230, protein: 9, carbs: 40, fat: 3 },
      serving: { quantity: 100, label: null },
    })
  })

  it("offers bread by the slice, not 100 g, when the row has no serving", () => {
    expect(foodFromRow(row({}))).toMatchObject({
      serving: { quantity: 38, label: null },
      measure: { noun: "slice", grams: 38 },
    })
  })

  it("marks a global row as shared", () => {
    expect(foodFromRow(row({ userId: null }))?.origin).toBe("shared")
  })

  it("keeps a per-one row's known unit and default quantity", () => {
    const food = foodFromRow(
      row({ unit: "slice", per100: null, perUnit: { kcal: 80, pro: 3, carb: 14, fat: 1 }, defaultQty: 2 }),
    )
    expect(food).toMatchObject({ unit: "slice", serving: { quantity: 2 } })
  })

  it("turns an unknown per-one unit into a piece, keeping the word as the label", () => {
    const food = foodFromRow(
      row({ unit: "egg", per100: null, perUnit: { kcal: 78, pro: 6.3, carb: 0.6, fat: 5.3 } }),
    )
    expect(food).toMatchObject({ unit: "piece", serving: { quantity: 1, label: "egg" } })
  })

  it("treats any per-100 row that does not say ml as grams", () => {
    expect(foodFromRow(row({ unit: "grams" }))?.unit).toBe("g")
    expect(foodFromRow(row({ unit: null }))?.unit).toBe("g")
    expect(foodFromRow(row({ unit: "ml" }))?.unit).toBe("ml")
  })

  it("drops a row whose jsonb macros are unreadable", () => {
    expect(foodFromRow(row({ per100: { kcal: 1 } as never }))).toBeNull()
  })
})

describe("rowValuesFromFood", () => {
  it("fills per100 for weight and volume, per_unit for everything else — never both", () => {
    const food = foodFromOff(KOO_PRODUCT)!
    const weighed = rowValuesFromFood(food)
    expect(weighed.per100).toEqual({ kcal: 95, pro: 5, carb: 16.5, fat: 0.5 })
    expect(weighed.perUnit).toBeNull()

    const counted = rowValuesFromFood({ ...food, unit: "slice" })
    expect(counted.per100).toBeNull()
    expect(counted.perUnit).toEqual({ kcal: 95, pro: 5, carb: 16.5, fat: 0.5 })
  })

  it("round-trips through foodFromRow", () => {
    const food = foodFromOff(KOO_PRODUCT)!
    const back = foodFromRow(row({ ...rowValuesFromFood(food), userId: null }))
    expect(back).toMatchObject({ per: food.per, unit: food.unit, serving: food.serving })
  })
})

describe("displayName", () => {
  it("folds the brand in front", () => {
    expect(displayName("Baked Beans in Tomato Sauce", "KOO")).toBe("KOO Baked Beans in Tomato Sauce")
  })

  it("does not double a brand the name already starts with", () => {
    expect(displayName("Koo beans 400g", "Koo")).toBe("Koo beans 400g")
  })

  it("leaves a brandless name alone", () => {
    expect(displayName("  Banana ", null)).toBe("Banana")
  })
})

describe("recentFoodsFromMeals", () => {
  const portion = (quantity: number) => ({
    quantity,
    unit: "g",
    per: { kcal: 130, pro: 2.7, carb: 28, fat: 0.3 },
  })
  const item = (name: string, quantity?: number) => ({
    name,
    qty: quantity === undefined ? "1 bowl" : `${quantity} g`,
    kcal: 1,
    pro: 1,
    carb: 1,
    fat: 1,
    ...(quantity === undefined ? {} : { portion: portion(quantity) }),
  })

  it("keeps the newest serving of each food", () => {
    const foods = recentFoodsFromMeals(
      [{ items: [item("Rice", 200)] }, { items: [item("rice ", 150), item("Chicken", 120)] }],
      10,
    )
    expect(foods.map((food) => [food.name, food.serving.quantity])).toEqual([
      ["Rice", 200],
      ["Chicken", 120],
    ])
  })

  it("skips lines with no portion — there is nothing to scale", () => {
    expect(recentFoodsFromMeals([{ items: [item("Migrated toast")] }], 10)).toEqual([])
  })

  it("survives a malformed items column", () => {
    expect(recentFoodsFromMeals([{ items: "not json" }, { items: null }], 10)).toEqual([])
  })

  it("stops at the limit", () => {
    const meals = [{ items: ["A", "B", "C"].map((name) => item(name, 100)) }]
    expect(recentFoodsFromMeals(meals, 2)).toHaveLength(2)
  })

  describe("with a slot", () => {
    // Newest first, as `recentFoods` reads them.
    const meals = [
      { name: "Dinner", loggedTime: "19:00", items: [item("Chicken", 150)] },
      { name: "Breakfast", loggedTime: "07:30", items: [item("Oats", 40), item("Coffee", 250)] },
      { name: "Lunch", loggedTime: "12:30", items: [item("Bread", 60)] },
      { name: "Oats and berries", loggedTime: "08:00", items: [item("Oats", 40), item("Blueberries", 80)] },
      { name: "Breakfast", loggedTime: null, items: [item("Oats", 40), item("oats", 40)] },
    ]

    it("puts foods eaten at that meal first, most often at the top", () => {
      expect(recentFoodsFromMeals(meals, 10, { slot: "Breakfast" }).map((food) => food.name)).toEqual([
        // Oats: three breakfasts. The second line in the last one is the same
        // meal, so it does not count twice.
        "Oats",
        "Coffee",
        // A meal named something else still counts where the clock puts it.
        "Blueberries",
        // Not breakfast foods, newest first.
        "Chicken",
        "Bread",
      ])
    })

    it("leaves the order alone without one", () => {
      expect(recentFoodsFromMeals(meals, 10).map((food) => food.name)).toEqual([
        "Chicken",
        "Oats",
        "Coffee",
        "Bread",
        "Blueberries",
      ])
    })
  })

  it("keeps only names containing the query", () => {
    const meals = [{ items: [item("Greek yogurt", 170), item("Granola", 40), item("Yogurt, plain", 100)] }]
    expect(recentFoodsFromMeals(meals, 10, { query: " YOG" }).map((food) => food.name)).toEqual([
      "Greek yogurt",
      "Yogurt, plain",
    ])
  })
})

describe("likePattern", () => {
  it("wraps the query in wildcards", () => {
    expect(likePattern("oats")).toBe("%oats%")
  })

  it("takes % and _ literally", () => {
    expect(likePattern("100%_juice")).toBe("%100\\%\\_juice%")
  })
})

describe("storedItemFromWrite / readMealItems", () => {
  const line = {
    name: "Rice",
    qty: "150 g",
    macros: { kcal: 195, protein: 4, carbs: 42, fat: 0.5 },
    portion: { quantity: 150, unit: "g" as const, per: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } },
  }

  it("stores in the column's vocabulary", () => {
    expect(storedItemFromWrite(line)).toEqual({
      name: "Rice",
      qty: "150 g",
      kcal: 195,
      pro: 4,
      carb: 42,
      fat: 0.5,
      portion: { quantity: 150, unit: "g", per: { kcal: 130, pro: 2.7, carb: 28, fat: 0.3 } },
    })
  })

  it("leaves portion out entirely when there is none, matching the migrated rows", () => {
    expect("portion" in storedItemFromWrite({ ...line, portion: null })).toBe(false)
  })

  it("round-trips a line through the column and back to the read shape", () => {
    expect(readMealItems([storedItemFromWrite(line)])).toEqual([line])
  })

  it("round-trips the unit a line was entered in", () => {
    const banana = {
      ...line,
      name: "Banana",
      qty: "1.5 bananas (177 g)",
      portion: { ...line.portion, quantity: 177, measure: { noun: "banana", grams: 118 } },
    }
    expect(readMealItems([storedItemFromWrite(banana)])).toEqual([banana])
  })

  it("reads a portionless line with portion: null", () => {
    expect(readMealItems([storedItemFromWrite({ ...line, portion: null })])[0]?.portion).toBeNull()
  })
})
