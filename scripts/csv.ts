/**
 * A minimal RFC 4180 CSV reader.
 *
 * Hand-written rather than pulled in as a dependency because the one file that
 * matters holds JSON inside a quoted field — `meal_logs.ings_json` — and a
 * naive line-and-comma split silently shreds it. The failure would not throw:
 * it would produce plausible-looking rows with truncated macros.
 */

/** Splits CSV text into rows, honouring quotes, escaped quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  // Excel and Supabase both sometimes prefix a byte-order mark, which would
  // otherwise become part of the first column's name.
  const source = text.replace(/^﻿/, "")

  for (let i = 0; i < source.length; i++) {
    const char = source[i]

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') inQuotes = true
    else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\r") {
      // Swallowed; the \n that follows ends the row.
    } else if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Drops the trailing blank line most exports end with.
  return rows.filter((r) => r.length > 1 || r[0] !== "")
}

export type CsvTable = {
  header: string[]
  /** One record per data row, keyed by column name. */
  rows: Record<string, string>[]
}

export function readCsv(text: string): CsvTable {
  const parsed = parseCsv(text)
  const header = parsed[0] ?? []
  const rows = parsed.slice(1).map((cells) => {
    const record: Record<string, string> = {}
    header.forEach((name, i) => {
      record[name] = cells[i] ?? ""
    })
    return record
  })
  return { header, rows }
}

/**
 * Postgres exports write an unset value as an empty string, which is a
 * different thing from a real empty string in the data. Everything nullable
 * goes through here so `""` never lands in the database as content.
 */
export function nullable(value: string | undefined): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (trimmed === "" || trimmed.toLowerCase() === "null") return null
  return value
}

/** Parses a required number, throwing rather than writing NaN. */
export function num(value: string | undefined, field: string): number {
  const parsed = Number(nullable(value))
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field}: expected a number, got ${JSON.stringify(value)}`)
  }
  return parsed
}

/** Parses an optional number. Absent stays absent; present must be valid. */
export function numOrNull(value: string | undefined, field: string): number | null {
  return nullable(value) === null ? null : num(value, field)
}

/** Parses a required timestamp, throwing rather than writing an Invalid Date. */
export function ts(value: string | undefined, field: string): Date {
  const raw = nullable(value)
  const parsed = raw === null ? new Date(Number.NaN) : new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field}: expected a timestamp, got ${JSON.stringify(value)}`)
  }
  return parsed
}
