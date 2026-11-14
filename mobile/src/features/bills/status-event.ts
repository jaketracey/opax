import { billSentenceCase, billStatusWord } from '../../api/bill-transforms';
import { formatDate } from '../../design/format';

/**
 * The event behind a bill's status date (specs/bills.md 2.1). A date is
 * always labelled by what happened on it, never by the status word: a bill
 * assented on 26 Aug reads "Royal Assent 26 Aug 2026", not "Passed".
 */
export interface StatusEvent {
  /** "Royal Assent", "Passed both houses", "Introduced", "Lapsed", "Status as at". */
  label: string;
  /** ISO date. */
  date: string;
  /** False when no recorded stage explains the date ("Status as at"). */
  resolved: boolean;
}

interface KeyDate {
  stage: string;
  date: string;
  house: string | null;
}

const TERMINAL =
  /^(lapsed|withdrawn|negatived|defeated|discharged|not passed|not proceeded with|removed from the notice paper)\b/i;

const words = (stage: string) =>
  billSentenceCase(stage).toLocaleLowerCase('en-AU');

/** The label one recorded stage gives its date, or null when it names no event. */
function stageEvent(
  stage: KeyDate,
  bill: { status: string; originating_house: string | null },
): string | null {
  const s = words(stage.stage);
  if (/assent/.test(s)) return 'Royal Assent';
  if (/passed both houses/.test(s)) return 'Passed both houses';
  // The third reading (or the record's "passed") in the house the bill did
  // not start in is when both houses had passed it.
  if (
    /^(third reading|passed)$/.test(s) &&
    stage.house &&
    bill.originating_house &&
    stage.house !== bill.originating_house
  )
    return 'Passed both houses';
  if (/^(introduced|first reading)/.test(s)) return 'Introduced';
  const status = billSentenceCase(bill.status);
  // "negatived" reads "Not agreed", the app's one wording (billStatusWord).
  if (TERMINAL.test(s)) return billStatusWord(stage.stage);
  // The register files the day a bill lapsed as "other".
  if (s === 'other' && TERMINAL.test(status)) return billStatusWord(bill.status);
  return null;
}

export function statusEvent(bill: {
  status: string;
  status_as_of: string | null;
  originating_house: string | null;
  key_dates?: readonly KeyDate[] | null;
  status_stage?: string | null;
}): StatusEvent | null {
  const date = bill.status_as_of;
  if (!date) return null;
  if (bill.status_stage) {
    const label = stageEvent(
      { stage: bill.status_stage, date, house: null },
      bill,
    );
    return label
      ? { label, date, resolved: true }
      : { label: 'Status as at', date, resolved: false };
  }
  // The last entry that day decides: a bill introduced and passed on one
  // day reads by its passage.
  const sameDay = (bill.key_dates ?? []).filter((d) => d.date === date);
  for (let i = sameDay.length - 1; i >= 0; i--) {
    const label = stageEvent(sameDay[i]!, bill);
    if (label) return { label, date, resolved: true };
  }
  return { label: 'Status as at', date, resolved: false };
}

/** "Royal Assent 26 Aug 2026", with non-breaking spaces so it never splits. */
export function statusEventText(
  event: Pick<StatusEvent, 'label' | 'date'>,
  style: 'short' | 'long' = 'short',
) {
  const text = `${event.label} ${formatDate(event.date, style)}`;
  return style === 'short' ? text.replace(/ /g, ' ') : text;
}

/**
 * The date a bill row carries: when it was introduced for a bill still
 * before parliament, otherwise its status event (the index rows carry no
 * key dates, so without `status_stage` the event is "Status as at").
 */
export function rowDate(bill: {
  status: string;
  status_as_of: string | null;
  introduced: string | null;
  originating_house: string | null;
  status_stage?: string | null;
}): { label: string; date: string } | null {
  if (bill.status === 'before_parliament' && bill.introduced)
    return { label: 'Introduced', date: bill.introduced };
  return statusEvent(bill);
}
