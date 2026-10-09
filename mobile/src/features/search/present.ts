// How a search result reads: its own title, a kind · date · place line and
// a count that agrees with its number. The web's search page (app.js,
// pass 3F) draws the same anatomy.
import { formatCount, formatDate } from '../../design/format';
import { jurisdictionName } from '../../design/parliament';
import { titleSubject } from '../records/citations';
import { typeLabel } from './contracts';

/** One result's kind, said in the singular ("Speech", not "Speeches and hearings"). */
const singular: Record<string, string> = {
  person: 'Person',
  party: 'Political party',
  donor: 'Donor',
  receipt: 'Political receipt',
  supplier: 'Supplier',
  agency: 'Government agency',
  contract: 'Government contract',
  grant: 'Grant',
  interest: 'Declared interest',
  expense: 'Parliamentary expenses',
  pay: 'Parliamentary pay',
  access: 'Meeting or lobbying register',
  campaigner: 'Campaigner or associated entity',
  bill: 'Bill',
  bill_text: 'Bill text',
  speech: 'Speech',
  division: 'Division',
  press_release: 'Transcript or release',
  report: 'Research report',
  grant_invitation: 'Grant invitation',
  grant_award: 'Grant award record',
  election_baseline: 'Election baseline',
  parliamentary_profile: 'Recorded representation',
  research_report: 'Research source note',
};
export const resultKindLabel = (kind: string) =>
  singular[kind] ?? typeLabel(kind);

/**
 * The record's own title. Search titles are built as "Speaker — Debate —
 * 2023-03-06"; the debate is the title, and the speaker and the date have
 * their own lines. A title that is only a speaker and a date has no subject
 * to show, so it reads "Speech by Don Farrell".
 */
export function resultTitle(record: {
  title: string;
  speaker?: string | null;
  date?: string | null;
  kind?: string;
}) {
  const subject = titleSubject(record);
  if (subject) return subject;
  if (record.speaker && record.kind === 'speech')
    return `Speech by ${record.speaker}`;
  return record.title;
}

/** "Speech · 6 Mar 2023 · Federal": what the record is, when, and where. */
export function resultMeta(record: {
  kind: string;
  date?: string | null;
  dateLabel?: string | null;
  state?: string | null;
}) {
  return [
    resultKindLabel(record.kind),
    record.dateLabel || (record.date ? formatDate(record.date, 'short') : null),
    jurisdictionName(record.state),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "1 record", "22 records", "200+ records": the count agrees with its number. */
export function countLabel(
  count: number,
  noun: readonly [one: string, many: string],
  more = false,
) {
  return `${formatCount(count)}${more ? '+' : ''} ${count === 1 && !more ? noun[0] : noun[1]}`;
}

/**
 * A saved copy as its block's source line says it: "offline" when the
 * device is offline, "Saved 3 Oct 2026" with the reason in the sheet when
 * the latest export could not be loaded or read (CatalogNotice's wording).
 */
export function savedCopy(
  stale: boolean,
  reason?: 'unreadable' | 'unavailable',
): { state: 'saved' | 'offline' | null; note: string | null } {
  if (!stale) return { state: null, note: null };
  if (!reason) return { state: 'offline', note: null };
  return {
    state: 'saved',
    note:
      reason === 'unreadable'
        ? 'The latest public export could not be read. Showing the saved copy.'
        : 'The latest public export could not be loaded. Showing the saved copy.',
  };
}
