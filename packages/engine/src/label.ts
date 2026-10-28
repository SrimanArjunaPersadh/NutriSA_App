import { labelKcal } from "./energy"
import { roundTo } from "./round"

/**
 * A label reading turned into the numbers the `create-food` form is filled with.
 *
 * The label reader (Phase 8) copies what the packet prints and does no
 * arithmetic, by the first standing rule. Two things on a label need some:
 * energy printed only in kJ (see `labelKcal`), and a label with only a
 * per-serving column, which has to become per 100 because that is how a food
 * is stored. Both happen here, and nowhere near the model.
 *
 * The types are written out rather than imported from `packages/shared/`,
 * which this package may not depend on; `LabelReading` there has this shape.
 */

export type LabelNumbers = {
  basis: "per_100g" | "per_100ml" | "per_serving" | null
  servingSize: { value: number; unit: "g" | "ml" } | null
  energyKj: number | null
  energyKcal: number | null
  protein: number | null
  carbohydrate: number | null
  fat: number | null
}

/** A value per basis, or null where the label gave none — a blank to fill, not a zero. */
export type LabelPer = {
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
}

export type LabelFoodDraft = {
  unit: "g" | "ml" | "piece"
  per: LabelPer
  /** The usual serving, in `unit`. Null when the label printed none in that unit. */
  servingQuantity: number | null
}

/**
 * Fill the form from a reading.
 *
 * - **Per 100 g / per 100 ml:** copied as printed, in that unit.
 * - **Per serving, with a serving size in g or ml:** rescaled to per 100 of
 *   that unit, and the serving size becomes the usual serving. Rounded the way
 *   every stored macro is: whole kcal, grams to one decimal.
 * - **Per serving with no gram or ml figure:** one serving is one piece. The
 *   numbers stay as printed; nothing can be rescaled without a size to scale by.
 * - **No basis read:** treated as per 100 g, the column SA labels print first.
 *   The reading is `partial` in that case and the user is reviewing it anyway.
 */
export function labelFoodDraft(reading: LabelNumbers): LabelFoodDraft {
  const printed: LabelPer = {
    kcal: labelKcal({ kcal: reading.energyKcal, kj: reading.energyKj }),
    protein: reading.protein,
    carbs: reading.carbohydrate,
    fat: reading.fat,
  }
  const serving = usableServing(reading.servingSize)

  if (reading.basis === "per_serving") {
    if (!serving) return { unit: "piece", per: printed, servingQuantity: 1 }

    const factor = 100 / serving.value
    return {
      unit: serving.unit,
      per: {
        kcal: scaled(printed.kcal, factor, 0),
        protein: scaled(printed.protein, factor, 1),
        carbs: scaled(printed.carbs, factor, 1),
        fat: scaled(printed.fat, factor, 1),
      },
      servingQuantity: serving.value,
    }
  }

  const unit = reading.basis === "per_100ml" ? "ml" : "g"
  return {
    unit,
    per: printed,
    servingQuantity: serving && serving.unit === unit ? serving.value : null,
  }
}

function usableServing(
  size: LabelNumbers["servingSize"],
): { value: number; unit: "g" | "ml" } | null {
  if (!size || !Number.isFinite(size.value) || size.value <= 0) return null
  return size
}

function scaled(value: number | null, factor: number, decimals: number): number | null {
  return value === null ? null : roundTo(value * factor, decimals)
}
