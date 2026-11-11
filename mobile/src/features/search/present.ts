// How a search result reads: its own title, a kind · date · place line and
// a count that agrees with its number. The web's search page (app.js,
// pass 3F) draws the same anatomy.
import { decodeEntities, passageText } from '../../api/passage-text';
import { isRecordSlug } from '../../api/record-policy';
import { formatCount, formatDate } from '../../design/format';
import { jurisdictionName } from '../../design/parliament';
import { titleSubject } from '../records/citations';
import { typeLabel } from './contracts';
import type { SearchRecord } from './decoders';

/** Resource IDs are opaque; only public record slugs can open the reader. */
export function speechSlug(row: SearchRecord): string | null {
  for (const candidate of [row.href, row.slug, row.resource]) {
    if (!candidate) continue;
    let slug = candidate;
    try {
      if (/^https?:\/\//.test(candidate)) {
        const url = new URL(candidate);
        if (
          url.protocol !== 'https:' ||
          !['opax.com.au', 'www.opax.com.au'].includes(url.host) ||
          url.username ||
          url.password
        )
          continue;
        slug = url.pathname;
      }
      const path = /^\/(?:doc|api\/resource)\/([^/?#]+)\/?(?:[?#].*)?$/.exec(
        slug,
      );
      slug = decodeURIComponent(path?.[1] ?? slug);
      if (isRecordSlug(slug)) return slug;
    } catch {
      // A malformed link can still have a usable record slug beside it.
    }
  }
  return null;
}

export { speechSpeaker } from '../records/speech-speaker';

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

/** Register result titles name the declaring member before the category. */
export function interestName(title: string) {
  return decodeEntities(title)
    .split(/\s+[\u2014–-]\s+|:\s+/)[0]!
    .trim();
}

/** Remove only the export's trailing holder and action cells. */
export function interestDetail(row: { title: string; snippet: string }) {
  const snippet = passageText(row.snippet);
  const cells =
    /^(.*)\.\s*(unspecified|self|spouse|children)?\.\s*(statement|addition|deletion|amendment)?\.\s*$/is.exec(
      snippet,
    );
  const holders: Record<string, string> = {
    self: 'Member',
    spouse: 'Spouse or partner',
    children: 'Dependent children',
  };
  const actions: Record<string, string> = {
    addition: 'Added',
    deletion: 'Removed',
    amendment: 'Amended',
  };
  const titleAction =
    /(?:\s+[\u2014–-]\s+|:\s+)(statement|addition|deletion|amendment)$/i.exec(
      row.title,
    )?.[1];
  return [
    (cells ? cells[1]! : snippet).trim().slice(0, 140),
    holders[cells?.[2]?.toLowerCase() ?? ''],
    actions[(cells?.[3] ?? titleAction ?? '').toLowerCase()],
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The record's own title. Search titles are built as "Speaker \u2014 Debate \u2014
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
  const title = decodeEntities(record.title);
  const speaker = record.speaker ? decodeEntities(record.speaker) : null;
  const subject = titleSubject({ ...record, title, speaker });
  if (subject) return subject;
  if (speaker && record.kind === 'speech') return `Speech by ${speaker}`;
  return title;
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
        ? 'The latest records could not be read. Showing the saved copy.'
        : 'The latest records could not be loaded. Showing the saved copy.',
  };
}
