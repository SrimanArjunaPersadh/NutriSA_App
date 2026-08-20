import { describe, expect, it } from "vitest"

import {
  addDays,
  checkLogDate,
  currentLoggingDay,
  currentClockTime,
  dayOfMonth,
  daysBetween,
  isLogDay,
  logMonth,
  startOfLogDayUtc,
  toLogDay,
  weekOf,
  weekdayIndex,
} from "./time"

describe("currentLoggingDay / toLogDay", () => {
  it("returns the SAST day, not the UTC day", () => {
    // 00:40 SAST on the 12th is 22:40 UTC on the 11th. This is the case the
    // spec calls out: anything reading the UTC date logs the meal to yesterday.
    expect(toLogDay(new Date("2026-08-11T22:40:00.000Z"))).toBe("2026-08-12")
  })

  it("holds the previous day right up to the boundary", () => {
    // 21:59:59 UTC is 23:59:59 SAST — still the 11th.
    expect(toLogDay(new Date("2026-08-11T21:59:59.999Z"))).toBe("2026-08-11")
    // One millisecond later it rolls over.
    expect(toLogDay(new Date("2026-08-11T22:00:00.000Z"))).toBe("2026-08-12")
  })

  it("rolls the month and the year at the SAST boundary", () => {
    expect(toLogDay(new Date("2026-08-31T22:00:00.000Z"))).toBe("2026-09-01")
    expect(toLogDay(new Date("2026-12-31T22:00:00.000Z"))).toBe("2027-01-01")
  })

  it("does not shift across a southern-hemisphere DST date", () => {
    // South Africa has never observed DST. Both sides of the date northern
    // clocks change on must stay UTC+2.
    expect(toLogDay(new Date("2026-03-29T21:59:00.000Z"))).toBe("2026-03-29")
    expect(toLogDay(new Date("2026-10-25T22:00:00.000Z"))).toBe("2026-10-26")
  })

  it("defaults to now", () => {
    expect(isLogDay(currentLoggingDay())).toBe(true)
  })
})

describe("startOfLogDayUtc", () => {
  it("starts a SAST day at 22:00 UTC the day before", () => {
    expect(startOfLogDayUtc("2026-08-12").toISOString()).toBe("2026-08-11T22:00:00.000Z")
  })

  it("round-trips with toLogDay", () => {
    expect(toLogDay(startOfLogDayUtc("2026-08-12"))).toBe("2026-08-12")
  })
})

describe("logMonth", () => {
  it("takes the month from the SAST day", () => {
    // 22:10 UTC on 31 Aug is 00:10 SAST on 1 Sep — September's budget, not
    // August's.
    expect(logMonth(toLogDay(new Date("2026-08-31T22:10:00.000Z")))).toBe("2026-09")
  })
})

describe("isLogDay", () => {
  it("accepts a real date", () => {
    expect(isLogDay("2026-08-12")).toBe(true)
    expect(isLogDay("2024-02-29")).toBe(true) // leap year
  })

  it("rejects malformed input", () => {
    for (const value of ["2026-8-12", "12-08-2026", "2026/08/12", "", "today"]) {
      expect(isLogDay(value), value).toBe(false)
    }
  })

  it("rejects well-formed dates that do not exist", () => {
    // These match the pattern but roll forward into a different day, which is
    // exactly how a typo becomes a silently wrong log entry.
    expect(isLogDay("2026-02-30")).toBe(false)
    expect(isLogDay("2026-13-01")).toBe(false)
    expect(isLogDay("2025-02-29")).toBe(false) // not a leap year
  })
})

describe("daysBetween / addDays", () => {
  it("counts forward and backward", () => {
    expect(daysBetween("2026-08-01", "2026-08-12")).toBe(11)
    expect(daysBetween("2026-08-12", "2026-08-01")).toBe(-11)
    expect(daysBetween("2026-08-12", "2026-08-12")).toBe(0)
  })

  it("spans the 37-day gap in the real series", () => {
    expect(daysBetween("2026-06-17", "2026-07-24")).toBe(37)
  })

  it("addDays is the inverse", () => {
    expect(addDays("2026-08-12", 37)).toBe("2026-09-18")
    expect(addDays("2026-09-18", -37)).toBe("2026-08-12")
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01")
  })
})

describe("checkLogDate", () => {
  const bounds = { today: "2026-08-12", firstLogDay: "2026-05-01" }

  it("accepts today and any day back to the first log", () => {
    expect(checkLogDate("2026-08-12", bounds)).toEqual({ ok: true, day: "2026-08-12" })
    expect(checkLogDate("2026-05-01", bounds)).toEqual({ ok: true, day: "2026-05-01" })
    expect(checkLogDate("2026-07-04", bounds)).toEqual({ ok: true, day: "2026-07-04" })
  })

  it("rejects tomorrow", () => {
    expect(checkLogDate("2026-08-13", bounds)).toEqual({
      ok: false,
      reason: "in-the-future",
    })
  })

  it("rejects a day before the first log", () => {
    expect(checkLogDate("2026-04-30", bounds)).toEqual({
      ok: false,
      reason: "before-first-log",
    })
  })

  it("rejects malformed input before any bounds check", () => {
    expect(checkLogDate("not-a-date", bounds)).toEqual({ ok: false, reason: "malformed" })
  })

  it("allows any past date for a user with no history yet", () => {
    expect(checkLogDate("2020-01-01", { today: "2026-08-12" }).ok).toBe(true)
  })

  /**
   * The write bound. Separate from `firstLogDay` because the write routes must
   * let a brand-new user back-fill yesterday — see the note on `LogDateBounds`.
   */
  describe("earliest", () => {
    const writeBounds = { today: "2026-08-12", earliest: "2026-05-13" }

    it("accepts the oldest permitted day and everything after it", () => {
      expect(checkLogDate("2026-05-13", writeBounds).ok).toBe(true)
      expect(checkLogDate("2026-08-12", writeBounds).ok).toBe(true)
    })

    it("rejects the day before it", () => {
      expect(checkLogDate("2026-05-12", writeBounds)).toEqual({
        ok: false,
        reason: "too-far-back",
      })
    })

    it("still rejects a future date first", () => {
      expect(checkLogDate("2026-08-13", writeBounds)).toEqual({
        ok: false,
        reason: "in-the-future",
      })
    })

    it("does not bound a user whose history predates it, unless asked to", () => {
      // No `earliest`, so a date picker over a long history keeps working.
      expect(checkLogDate("2020-01-01", { today: "2026-08-12" }).ok).toBe(true)
    })

    it("reports the first-log reason when both bounds are broken", () => {
      expect(
        checkLogDate("2026-01-01", {
          today: "2026-08-12",
          firstLogDay: "2026-05-01",
          earliest: "2026-05-13",
        }),
      ).toEqual({ ok: false, reason: "before-first-log" })
    })
  })
})

describe("weekdayIndex", () => {
  it("numbers Sunday as 0 and Saturday as 6", () => {
    expect(weekdayIndex("2026-08-09")).toBe(0) // Sunday
    expect(weekdayIndex("2026-08-13")).toBe(4) // Thursday
    expect(weekdayIndex("2026-08-15")).toBe(6) // Saturday
  })

  it("does not shift the day into SAST first", () => {
    // Reading the weekday through startOfLogDayUtc would land on 22:00 the
    // previous day and report Saturday for a Sunday. Every date in the strip
    // would be one column out.
    expect(weekdayIndex("2026-03-01")).toBe(0)
    expect(weekdayIndex("2026-02-28")).toBe(6)
  })
})

describe("weekOf", () => {
  it("returns Sunday to Saturday by default, oldest first", () => {
    expect(weekOf("2026-08-13")).toEqual([
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ])
  })

  it("gives the same week for every day inside it", () => {
    const week = weekOf("2026-08-13")
    for (const day of week) {
      expect(weekOf(day)).toEqual(week)
    }
  })

  it("starts on the day itself when that day is the week start", () => {
    expect(weekOf("2026-08-09")[0]).toBe("2026-08-09")
    expect(weekOf("2026-08-10", 1)[0]).toBe("2026-08-10")
  })

  it("honours a Monday start", () => {
    // The strip shows Sunday-first, but the week start is a display choice and
    // not a locale fact — SA conventionally starts on Monday.
    expect(weekOf("2026-08-13", 1)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ])
  })

  it("crosses a month boundary without losing a day", () => {
    // 1 March 2026 is a Sunday, so its week is entirely inside March, while
    // the Saturday before it belongs to a week that is entirely inside
    // February. An off-by-one in the offset shows up here first.
    expect(weekOf("2026-03-01")).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
    ])
    expect(weekOf("2026-02-28")[6]).toBe("2026-02-28")
  })

  it("crosses a year boundary", () => {
    expect(weekOf("2027-01-01", 1)).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ])
  })

  it("always returns seven consecutive days", () => {
    const week = weekOf("2026-08-13")
    expect(week).toHaveLength(7)
    for (let i = 1; i < week.length; i += 1) {
      expect(daysBetween(week[i - 1], week[i])).toBe(1)
    }
  })
})

describe("dayOfMonth", () => {
  it("strips the leading zero", () => {
    expect(dayOfMonth("2026-08-09")).toBe(9)
    expect(dayOfMonth("2026-08-27")).toBe(27)
    expect(dayOfMonth("2026-03-01")).toBe(1)
  })
})

describe("currentClockTime", () => {
  it("reads the clock in SAST, not in the machine's timezone", () => {
    // 22:40 UTC is 00:40 the next day in SAST — the case the whole module
    // exists for, applied to the time rather than the date.
    expect(currentClockTime(new Date("2026-08-19T22:40:00Z"))).toBe("00:40")
  })

  it("pads both halves", () => {
    expect(currentClockTime(new Date("2026-08-20T05:03:00Z"))).toBe("07:03")
    expect(currentClockTime(new Date("2026-08-20T22:00:00Z"))).toBe("00:00")
  })

  it("agrees with currentLoggingDay about which day it is", () => {
    // The pair must never disagree: a 00:40 stamp on yesterday's date would be
    // a meal that claims to have been eaten before it was logged.
    const instant = new Date("2026-08-19T22:40:00Z")
    expect(currentLoggingDay(instant)).toBe("2026-08-20")
    expect(currentClockTime(instant)).toBe("00:40")
  })

  it("matches the shape the write schemas accept", () => {
    expect(currentClockTime(new Date("2026-08-20T09:15:00Z"))).toMatch(
      /^([01]\d|2[0-3]):[0-5]\d$/,
    )
  })
})
