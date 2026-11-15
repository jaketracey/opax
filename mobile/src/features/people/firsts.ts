import type { Href } from 'expo-router';
import type { MemberFirsts } from '../../api/people-firsts';
import { formatDate, unbroken } from '../../design/format';
import { docRoute } from '../../navigation/routes';

/**
 * A member's first speech and first division, as the two rows the profile
 * draws under the seat: the date in the title, the source on the line under
 * it. The page and its placeholder both read this, so the placeholder holds
 * the page's own words.
 *
 * "First" only when the export marked it so (the person entered that chamber
 * on or after the date its record starts). Any other fact is the earliest
 * the OPAX record holds, with the year that record starts, and is never
 * called a first. Nothing here ranks or compares.
 */
export interface FirstRow {
  kind: 'first-speech' | 'first-division';
  title: string;
  /** The source, as the file names it. */
  detail: string;
  href?: Href;
  external?: { url: string; label: string };
  accessibilityLabel: string;
  accessibilityHint: string;
  testID: string;
}

const title = (
  what: 'speech' | 'division',
  fact: { date: string; first: boolean; recordFrom?: number },
) =>
  `${
    fact.first
      ? `First ${what}`
      : `Earliest ${what} in the OPAX record (from ${fact.recordFrom})`
  }: ${unbroken(formatDate(fact.date, 'short'))}`;
const spoken = (
  what: 'speech' | 'division',
  fact: { date: string; first: boolean; recordFrom?: number; source: string },
) =>
  `${
    fact.first
      ? `First ${what}`
      : `Earliest ${what} in the OPAX record, which starts in ${fact.recordFrom}`
  }, ${formatDate(fact.date)}. Source: ${fact.source}`;

export function firstRows(firsts: MemberFirsts | null | undefined): FirstRow[] {
  const rows: FirstRow[] = [];
  if (firsts?.speech) {
    const { slug, source } = firsts.speech;
    rows.push({
      kind: 'first-speech',
      title: title('speech', firsts.speech),
      detail: source,
      href: docRoute(slug),
      accessibilityLabel: spoken('speech', firsts.speech),
      accessibilityHint: 'Opens the speech',
      testID: 'person-first-speech',
    });
  }
  if (firsts?.division) {
    const { date, url, source } = firsts.division;
    rows.push({
      kind: 'first-division',
      title: title('division', firsts.division),
      detail: source,
      external: { url, label: `Division of ${formatDate(date)}` },
      accessibilityLabel: spoken('division', firsts.division),
      accessibilityHint: 'Opens the division in the in-app browser',
      testID: 'person-first-division',
    });
  }
  return rows;
}
