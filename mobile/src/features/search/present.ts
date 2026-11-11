// How a search result reads: its own title, a kind · date · place line and
// a count that agrees with its number. The web's search page (app.js,
// pass 3F) draws the same anatomy.
import { decodeEntities } from '../../api/passage-text';
import type { Roster, Slugs } from '../../api/catalog-decoders';
import { nameKey } from '../../api/ids';
import { isRecordSlug } from '../../api/record-policy';
import { formatCount, formatDate } from '../../design/format';
import { jurisdictionName } from '../../design/parliament';
import { titleSubject } from '../records/citations';
import { typeLabel } from './contracts';
import type { SearchRecord } from './decoders';

const profileNames = new WeakMap<Slugs, Map<string, string[]>>();
function speakerProfiles(slugs: Slugs, names: string[]) {
  let index = profileNames.get(slugs);
  if (!index) {
    index = new Map();
    for (const [slug, name] of Object.entries(slugs.slugs)) {
      const key = nameKey(name);
      index.set(key, [...(index.get(key) ?? []), slug]);
    }
    profileNames.set(slugs, index);
  }
  return [...new Set(names.flatMap((name) => index.get(nameKey(name)) ?? []))];
}

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

/** Resolve the recorded speaker without inventing a profile from their name. */
export function speechSpeaker(
  row: SearchRecord,
  roster: Roster | null,
  slugs: Slugs | null,
) {
  if (!row.speaker) return null;
  const name = decodeEntities(row.speaker);
  const matches = roster?.people.filter(
    (person) =>
      nameKey(person.name) === nameKey(name) ||
      (!!person.full && nameKey(person.full) === nameKey(name)),
  );
  const person = matches?.length === 1 ? matches[0] : undefined;
  const profiles =
    person && slugs
      ? speakerProfiles(slugs, [person.name, person.full ?? person.name])
      : [];
  return {
    name,
    party: row.party ?? null,
    slug: profiles.length === 1 ? profiles[0] : undefined,
  };
}

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
