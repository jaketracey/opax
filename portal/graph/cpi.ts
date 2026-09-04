// ABS 6401.0, Consumer Price Index, Australia, June 2026, Table 17:
// "Index Numbers; All groups CPI; Australia" (the weighted average of eight
// capital cities), original series A2325846C. Released 29 July 2026; values
// downloaded 5 September 2026. The quarterly series is referenced to
// September 2025 = 100.0. Each value below is OPAX's arithmetic mean of the
// September, December, March and June quarter index numbers in that financial
// year. In an ABS release before the June quarter, the final financial year
// may therefore be a partial-year average; this release contains all four
// quarters of 2025-26.
//
// Money graph `byYear` keys name the year in which the financial year begins,
// so key 2025 means 2025-26. The table starts one year before the federal
// export so callers can also use it with any 1997-98 cells in later exports.

export const CPI_FINANCIAL_YEAR_INDEX: Readonly<Record<number, number>> = {
  1997: 46.4900,
  1998: 47.0975,
  1999: 48.2150,
  2000: 51.0950,
  2001: 52.5600,
  2002: 54.1800,
  2003: 55.4575,
  2004: 56.7975,
  2005: 58.6275,
  2006: 60.3375,
  2007: 62.3900,
  2008: 64.3275,
  2009: 65.8275,
  2010: 67.8725,
  2011: 69.4500,
  2012: 71.0125,
  2013: 72.9475,
  2014: 74.1875,
  2015: 75.2050,
  2016: 76.4925,
  2017: 77.9800,
  2018: 79.2500,
  2019: 80.3225,
  2020: 81.6025,
  2021: 85.2600,
  2022: 91.2500,
  2023: 95.0725,
  2024: 97.3900,
  2025: 101.0150,
}

export const CPI_REFERENCE_YEAR = 2025

const CPI_FIRST_YEAR = 1997
const CPI_LAST_YEAR = CPI_REFERENCE_YEAR

export function cpiIndexForYear(year: number): number {
  // A disclosure outside the published table uses the nearest financial year
  // rather than silently dropping its dollars from the adjusted total.
  const key = !Number.isFinite(year)
    ? CPI_REFERENCE_YEAR
    : Math.max(CPI_FIRST_YEAR, Math.min(CPI_LAST_YEAR, Math.trunc(year)))
  return CPI_FINANCIAL_YEAR_INDEX[key]!
}

/** Convert dollars in a graph financial-year cell to 2025-26 dollars. */
export function cpiMultiplier(year: number): number {
  return CPI_FINANCIAL_YEAR_INDEX[CPI_REFERENCE_YEAR]! / cpiIndexForYear(year)
}
