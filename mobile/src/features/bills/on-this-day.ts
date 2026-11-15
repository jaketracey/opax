import type { Bill } from '../../api/catalog-decoders';
import type { SydneyDate } from '../today/rules';

/**
 * On this day: a bill introduced on today's date in an earlier year, from
 * the bills register the list already holds. Pure, in Sydney dates; nothing
 * here reads the clock.
 *
 * The choice is by date alone. Every bill introduced on this day of the
 * month in an earlier year is a candidate, in the order the register
 * introduced them (date, then register key). When there are several they
 * take turns year by year, so no bill, house or sponsor is preferred.
 * 29 February matches only 29 February. No candidate, no row.
 */
export interface OnThisDayBill {
  bill: Bill;
  /** The year the bill was introduced. */
  year: number;
  /** The bill's introduction date, "2018-11-15". */
  date: string;
}

/** The rule, word for word, as the row's "How this is chosen" sheet shows it. */
export const ON_THIS_DAY_RULE =
  'A bill introduced on this date in an earlier year, from ParlInfo’s bills register. When there are several, they take turns year by year, in the order they were introduced.';

const DAY = /^\d{4}-\d{2}-\d{2}/;

export function onThisDay(
  bills: readonly Bill[] | null | undefined,
  today: SydneyDate,
): OnThisDayBill | null {
  if (!bills?.length || !DAY.test(today)) return null;
  const year = Number(today.slice(0, 4));
  const monthDay = today.slice(4, 10);
  const candidates = bills
    .filter(
      (b) =>
        !!b.introduced &&
        DAY.test(b.introduced) &&
        b.introduced.slice(4, 10) === monthDay &&
        Number(b.introduced.slice(0, 4)) < year,
    )
    .sort(
      (a, b) =>
        a.introduced!.slice(0, 10).localeCompare(b.introduced!.slice(0, 10)) ||
        a.key.localeCompare(b.key, 'en', { numeric: true }),
    );
  if (!candidates.length) return null;
  const bill = candidates[year % candidates.length]!;
  const date = bill.introduced!.slice(0, 10);
  return { bill, year: Number(date.slice(0, 4)), date };
}
