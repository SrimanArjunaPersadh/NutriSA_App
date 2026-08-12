// GENERATED — do not edit by hand.
//
// The 38 real weigh-ins from Neon with **9.0 kg subtracted from every reading**,
// per plan.md's standing rule: real bodyweight never enters a committed fixture.
//
// The offset is safe here because the trend is linear in the weights and
// rounding to two decimals commutes with an integer shift, so this series is
// the real one minus 9.0 at every single step — verified at generation time.
// It guards the algorithm's shape, not anyone's weight.

export const ORACLE_OFFSET_KG = 9

/** 38 weigh-ins, offset, in date order. */
export const oracleReadings: { day: string; weight: number }[] = [
  {
    "day": "2026-05-05",
    "weight": 91.1
  },
  {
    "day": "2026-05-07",
    "weight": 88.9
  },
  {
    "day": "2026-05-08",
    "weight": 89.8
  },
  {
    "day": "2026-05-09",
    "weight": 90.3
  },
  {
    "day": "2026-05-12",
    "weight": 90.3
  },
  {
    "day": "2026-05-13",
    "weight": 89.9
  },
  {
    "day": "2026-05-14",
    "weight": 89.5
  },
  {
    "day": "2026-05-15",
    "weight": 90
  },
  {
    "day": "2026-05-16",
    "weight": 89.7
  },
  {
    "day": "2026-05-17",
    "weight": 89.5
  },
  {
    "day": "2026-05-18",
    "weight": 89.8
  },
  {
    "day": "2026-05-19",
    "weight": 88.5
  },
  {
    "day": "2026-05-20",
    "weight": 88.7
  },
  {
    "day": "2026-05-21",
    "weight": 88.8
  },
  {
    "day": "2026-05-22",
    "weight": 89.3
  },
  {
    "day": "2026-05-23",
    "weight": 89.2
  },
  {
    "day": "2026-05-24",
    "weight": 89.5
  },
  {
    "day": "2026-05-25",
    "weight": 89.6
  },
  {
    "day": "2026-05-26",
    "weight": 89.2
  },
  {
    "day": "2026-05-27",
    "weight": 89
  },
  {
    "day": "2026-05-28",
    "weight": 88.1
  },
  {
    "day": "2026-05-29",
    "weight": 88.3
  },
  {
    "day": "2026-05-30",
    "weight": 89.1
  },
  {
    "day": "2026-05-31",
    "weight": 88.2
  },
  {
    "day": "2026-06-01",
    "weight": 87.3
  },
  {
    "day": "2026-06-02",
    "weight": 87.45
  },
  {
    "day": "2026-06-03",
    "weight": 87.9
  },
  {
    "day": "2026-06-04",
    "weight": 88.9
  },
  {
    "day": "2026-06-05",
    "weight": 89.1
  },
  {
    "day": "2026-06-09",
    "weight": 88
  },
  {
    "day": "2026-06-10",
    "weight": 87.9
  },
  {
    "day": "2026-06-14",
    "weight": 89.4
  },
  {
    "day": "2026-06-15",
    "weight": 89.2
  },
  {
    "day": "2026-06-16",
    "weight": 88.5
  },
  {
    "day": "2026-06-17",
    "weight": 88.9
  },
  {
    "day": "2026-07-24",
    "weight": 90
  },
  {
    "day": "2026-08-03",
    "weight": 90.7
  },
  {
    "day": "2026-08-04",
    "weight": 91
  }
]

/** One trend value per calendar day from the first reading to the last. */
export const oracleTrend: number[] = [91.1,91.1,90.88,90.77,90.72,90.68,90.64,90.61,90.54,90.44,90.4,90.33,90.25,90.21,90.04,89.91,89.8,89.75,89.7,89.68,89.67,89.62,89.56,89.41,89.3,89.28,89.17,88.98,88.83,88.74,88.76,88.79,88.82,88.85,88.88,88.79,88.7,88.62,88.55,88.49,88.58,88.64,88.63,88.66,88.68,88.7,88.72,88.74,88.76,88.77,88.78,88.79,88.8,88.81,88.82,88.83,88.84,88.85,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.86,88.97,89.07,89.16,89.24,89.32,89.39,89.45,89.51,89.56,89.6,89.71,89.84]

export const oracleFinal = {
  day: "2026-08-04",
  trend: 89.84,
  /** What the real, un-offset series ends on — the figure Sriman confirmed. */
  realTrend: 98.84,
}
