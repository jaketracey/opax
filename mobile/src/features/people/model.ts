import {
  array,
  boolean,
  count,
  date,
  dict,
  invalid,
  nonempty,
  nullable,
  number,
  optional,
  shape,
  text,
  url,
} from '../../api/validation';
import { passageText } from '../../api/passage-text';
import type { PersonProfile } from '../../api/person-identity';

const topic = shape({
  slug: nonempty,
  count,
  share: (v: unknown) => {
    const n = number(v);
    return n >= 0 && n <= 1 ? n : invalid();
  },
});
const era = shape({
  label: nonempty,
  from: count,
  to: count,
  labelled: count,
  topics: array(topic),
});
export const decodePersonTopics = shape({
  name: nonempty,
  indexed: count,
  profiles: shape({ all: era, then: era, now: era }),
  coverage: optional(text),
});
export const decodeTopics = shape({
  labelled: count,
  topics: array(shape({ slug: nonempty, count })),
  coverage: optional(text),
});
export const decodeRecords = shape({
  results: array(
    shape({
      slug: nonempty,
      resource: optional(text),
      title: optional(text),
      title_subject: optional(text),
      speaker: optional(text),
      date: optional(date),
      state: optional(text),
      chamber: optional(text),
      snippet: optional(text),
      speaker_type: optional(text),
    }),
  ),
  coverage: optional(text),
});
export type RecordRow = ReturnType<typeof decodeRecords>['results'][number];
export const decodeBriefs = shape({
  briefs: dict(text, (v: unknown) =>
    /^[a-f0-9]{32}$/.test(nonempty(v)) ? nonempty(v) : invalid(),
  ),
});
export const decodeNews = shape({
  items: array(
    shape({
      title: nonempty,
      url,
      source: nonempty,
      published: optional(date),
    }),
  ),
  fetched_at: optional(date),
});
const meeting = shape({
  minister: nonempty,
  jurisdiction: nonempty,
  date: optional(date),
  purpose: optional(text),
});
const lobbyist = shape({
  firm: nonempty,
  jurisdiction: nonempty,
  registered: optional(date),
  ceased: optional(boolean),
});
const pair = (v: unknown): [string, number] => {
  if (!Array.isArray(v) || v.length < 2) invalid();
  return [nonempty(v[0]), count(v[1])];
};
const minister = shape({
  name: nonempty,
  jurisdiction: (v: unknown): 'nsw' | 'qld' =>
    v === 'nsw' || v === 'qld' ? v : invalid(),
  surname_key: optional(boolean),
  meetings_total: count,
  external_total: count,
  by_org: array(pair),
  recent: array(shape({ date, org: nonempty, purpose: optional(text) })),
  latest_pdf: optional(url),
});
export const decodeAccess = shape({
  meta: shape({ generated: date, sources: array(nonempty) }),
  donors: dict(
    shape({
      meetings: optional(array(meeting)),
      meetings_total: optional(count),
      lobbyists: optional(array(lobbyist)),
      lobbyists_total: optional(count),
    }),
  ),
  ministers: dict(minister),
  aliases: dict(nonempty),
});
export type Access = ReturnType<typeof decodeAccess>;
const amount = (v: unknown) => {
  const n = number(v);
  return n >= 0 ? n : invalid();
};
const returnRow = (v: unknown) => {
  if (
    !Array.isArray(v) ||
    v.length !== 8 ||
    !/^\d{4}-\d{2}$/.test(nonempty(v[0]))
  )
    invalid();
  return {
    year: nonempty(v[0]),
    receipts: nullable(amount)(v[1]),
    payments: nullable(amount)(v[2]),
    debts: nullable(amount)(v[3]),
    branches: count(v[4]),
    donations: nullable(amount)(v[5]),
    other: nullable(amount)(v[6]),
    funding: nullable(amount)(v[7]),
  };
};
const debtYear = (v: unknown): [string, number] => {
  if (!Array.isArray(v) || v.length < 2) invalid();
  return [nonempty(v[0]), amount(v[1])];
};
export const decodeFunding = shape({
  meta: shape({
    generated: date,
    source: nonempty,
    register_url: url,
    licence: nonempty,
  }),
  parties: dict(
    shape({
      returns: optional(array(returnRow)),
      debts: optional(
        shape({
          year: nonempty,
          total: amount,
          financial_total: amount,
          lenders: count,
          top: array(shape({ name: nonempty, amount, type: nonempty })),
          by_year: array(debtYear),
        }),
      ),
      benefits: optional(
        shape({
          year: nonempty,
          total: amount,
          top: array(shape({ name: nonempty, amount })),
        }),
      ),
    }),
  ),
});

// Same normalisation as web normName; an alias/surname must have matching
// verified representation evidence. Never infer jurisdiction from speeches.
export const normalName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(pty|ltd|limited|the|inc|co|holdings)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
export function diaryFor(identity: PersonProfile, access: Access) {
  const nn = normalName(identity.name);
  const key = Object.hasOwn(access.ministers, nn) ? nn : access.aliases[nn];
  const m = key ? access.ministers[key] : undefined;
  const jurisdictions = new Set([
    ...identity.seats.map((s) => s.jurisdiction),
    ...(identity.rosterRow?.states ?? []),
    ...(identity.rosterRow?.representation ?? []).map((s) => s.jurisdiction),
  ]);
  if (!m || !jurisdictions.has(m.jurisdiction)) return null;
  return m;
}
export function matchingNews(
  name: string,
  items: ReturnType<typeof decodeNews>['items'],
) {
  const tokens = name
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 4 &&
        !/^(party|australia|australian|limited|pty|ltd|holdings|the)$/i.test(w),
    );
  return items
    .filter((i) =>
      tokens.some((t) =>
        new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(
          i.title,
        ),
      ),
    )
    .slice(0, 4);
}
export function receiptsSeries(
  rows: ReturnType<typeof decodeFunding>['parties'][string]['returns'],
) {
  return (rows ?? [])
    .filter((r) => r.receipts !== null && r.receipts > 0)
    .map((r) => {
      const receipts = r.receipts!;
      const donations = Math.min(r.donations ?? 0, receipts);
      const other = Math.min(r.other ?? 0, receipts - donations);
      return {
        ...r,
        receipts,
        donations,
        other,
        notItemised: receipts - donations - other,
        clamped: (r.donations ?? 0) + (r.other ?? 0) > receipts,
      };
    })
    .sort((a, b) => b.year.localeCompare(a.year));
}

export function displayedRecordTitle(row: RecordRow) {
  const key = (value: string) =>
    value.trim().replace(/\s+/g, ' ').toLowerCase();
  const parts = (row.title_subject || row.title || '')
    .trim()
    .split(/(\s+—\s+)/);
  if (row.speaker && key(parts[0] ?? '') === key(row.speaker))
    parts.splice(0, 2);
  if (row.date) {
    const iso = row.date.slice(0, 10);
    const written = new Intl.DateTimeFormat('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(iso));
    if ([key(iso), key(written)].includes(key(parts.at(-1) ?? '')))
      parts.splice(-2);
  }
  return parts.join('').trim() || row.title || 'Speech';
}

export function cleanPassage(text: string | undefined) {
  let raw = passageText(text, { paragraphs: true }).replace(
    /\b(?:the\s+)?full\s+listing\s+can\s+be\s+found\s+at\s*:?\s*(?:\[[^\]\n]*\]\(https?:\/\/[^\s)]+\)|<https?:\/\/[^>\s]+>|https?:\/\/[^\s<>]+)\.?/gi,
    '',
  );
  // A heading the source glued above the passage: "Gambling\n\nGambling is also…"
  const head = /^\s*([^\n]{1,80}?)[ \t]*\n(?:[ \t]*\n)+/.exec(raw);
  if (
    head &&
    !/[.!?,;:]$/.test(head[1]!.trim()) &&
    head[1]!.trim().split(/\s+/).length <= 8
  )
    raw = raw.slice(head[0].length);
  let s = raw.replace(/\s+/g, ' ').trim().replace(/^…\s*/, '');
  s = s.replace(/^\[[^\]]{0,400}\]\s*/, '');
  // The same block when the highlighter's window opens inside it:
  // "PORTFOLIO Australian Communications and Media Authority] Given we know…"
  s = s.replace(/^(?![^\]]*\.\s)[^\[\]]{0,300}\]\s*/, '');
  // banner: honorific + name, one or more parentheticals, then a colon or dash
  s = s.replace(
    /^(?:(?:the\s+)?hon\.?|mr|mrs|ms|miss|dr|prof\.?|professor|senator|madam|rev\.?)\s+[A-Za-z][A-Za-z'’.\-]*(?:\s+[A-Za-z][A-Za-z'’.\-]*){0,4}\s*(?:\([^)]{0,80}\)\s*)+(?:[:—–-]|\.-)\s*/i,
    '',
  );
  // banner: honorific + ALL-CAPS name, then a colon or dash
  s = s.replace(
    /^(?:(?:the\s+)?hon\.?|mr|mrs|ms|miss|dr|prof\.?|senator|madam)\s+[A-Z][A-Z'’.\-]+(?:\s+[A-Z][A-Za-z'’.\-]+){0,4}\s*[:—–-]\s*/,
    '',
  );
  // committee turn: "Ms Barrett : " (a short name, then a colon)
  s = s.replace(
    /^(?:mr|mrs|ms|miss|dr|prof\.?|senator|chair|the chair)\s+[A-Za-z][A-Za-z'’.\-]*(?:\s+[A-Za-z][A-Za-z'’.\-]*)?\s*:\s+/i,
    '',
  );
  s = s.replace(/^[:;,—–\-\s]+/, '');
  return s;
}
