import { decodeEntities, serverPassage } from '../../api/passage-text';
import type { PersonProfile } from '../../api/person-identity';
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
import { formatDate, formatYearRange } from '../../design/format';
import { chamberName, jurisdictionName } from '../../design/parliament';
import type { SourceCitation } from '../../design/source';
import type { ProfileView } from '../your-mp/model';

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
      kind: optional(text),
      resource: optional(text),
      title: optional(text),
      title_subject: optional(text),
      speaker: optional(text),
      date: optional(date),
      state: optional(text),
      chamber: optional(text),
      snippet: optional(text),
      speaker_type: optional(text),
      // Words in the turn; absent or null (unknown) on servers before short-turn-v1.
      word_count: optional(number),
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
  const parts = decodeEntities(row.title_subject || row.title || '')
    .trim()
    .split(/(\s+\u2014\s+)/);
  if (row.speaker && key(parts[0] ?? '') === key(decodeEntities(row.speaker)))
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
  return parts.join('').trim() || decodeEntities(row.title || '') || 'Speech';
}

export function cleanPassage(text: string | undefined) {
  let raw = serverPassage(text, { paragraphs: true }).replace(
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
    /^(?:(?:the\s+)?hon\.?|mr|mrs|ms|miss|dr|prof\.?|professor|senator|madam|rev\.?)\s+[A-Za-z][A-Za-z'’.\-]*(?:\s+[A-Za-z][A-Za-z'’.\-]*){0,4}\s*(?:\([^)]{0,80}\)\s*)+(?:[:\u2014–-]|\.-)\s*/i,
    '',
  );
  // banner: honorific + ALL-CAPS name, then a colon or dash
  s = s.replace(
    /^(?:(?:the\s+)?hon\.?|mr|mrs|ms|miss|dr|prof\.?|senator|madam)\s+[A-Z][A-Z'’.\-]+(?:\s+[A-Z][A-Za-z'’.\-]+){0,4}\s*[:\u2014–-]\s*/,
    '',
  );
  // committee turn: "Ms Barrett : " (a short name, then a colon)
  s = s.replace(
    /^(?:mr|mrs|ms|miss|dr|prof\.?|senator|chair|the chair)\s+[A-Za-z][A-Za-z'’.\-]*(?:\s+[A-Za-z][A-Za-z'’.\-]*)?\s*:\s+/i,
    '',
  );
  s = s.replace(/^[:;,\u2014–\-\s]+/, '');
  return s;
}

// ---------------------------------------------------------------------------
// Profile selectors (people.md 2.1). Each strip tile and its section read the
// same selector, so a strip figure and its section's figure never differ.

/**
 * The profile's section order (DECISIONS.md D6, recommended). Jake's answer
 * is a one-line change: if he keeps the 1.0 order, `receipts` moves first.
 */
export const PROFILE_SECTIONS = [
  'votes',
  'interests',
  'pay',
  'expenses',
  'receipts',
  'diary',
  'more',
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];
/** The sections a profile link may open at (`?section=`). */
export type ProfileArrival = 'votes' | 'interests' | 'pay' | 'changes';
export function profileArrival(value: unknown): ProfileArrival | undefined {
  return value === 'votes' ||
    value === 'interests' ||
    value === 'pay' ||
    value === 'changes'
    ? value
    : undefined;
}

type Blocks = ProfileView['blocks'];
export const votesCount = (profile: Pick<ProfileView, 'blocks'>) =>
  profile.blocks.votes.data?.total ?? null;
export const interestsCount = (profile: Pick<ProfileView, 'blocks'>) =>
  profile.blocks.interests.data?.total ?? null;
export const annualPay = (profile: Pick<ProfileView, 'blocks'>) =>
  profile.blocks.pay.data?.person.now?.salary ?? null;
/** The year of the member's earliest recorded division: "votes since 2006". */
export const votesSince = (profile: Pick<ProfileView, 'blocks'>) =>
  profile.blocks.votes.data?.years[0] ?? null;

/**
 * "Prime Minister", "Minister for Health and Aged Care and 1 more",
 * "Former member", or null (a sitting member with no paid post, and every
 * state member). Former takes precedence over any post.
 */
export function roleLine(
  profile: Pick<ProfileView, 'blocks'>,
  former: boolean,
): string | null {
  if (former) return 'Former member';
  const pay = profile.blocks.pay.data;
  const now = pay?.person.now;
  if (!now || /^(member|senator)\b/i.test(now.post)) return null;
  const current = pay.person.spells.filter(([, to]) => to === null);
  const others = new Set(
    current.map(([, , post]) => post).filter((post) => post !== now.post),
  ).size;
  return others ? `${now.post} and ${others} more` : now.post;
}

/** Last dated representation, with no guessed place or service years. */
export function formerMemberLine(identity: PersonProfile): string | null {
  if (identity.partyStatus !== 'former') return null;
  const row = seatRows(identity).at(-1);
  if (row) return [row.title, row.detail].filter(Boolean).join(', ');
  const last = identity.rosterRow?.representation?.at(-1);
  if (!last) return 'Former member';
  const state = last.state
    ? (jurisdictionName(last.state) ?? last.state)
    : null;
  const place = [last.electorate, state].filter(Boolean).join(', ');
  return place
    ? `Former ${last.chamber === 'senate' ? 'senator' : 'member'} for ${place}`
    : 'Former member';
}

/**
 * Pay's line: the post and the rate's own effective date from the
 * instrument, never the date the post began. Salaries re-index each 1 July,
 * so the date moves with the rate.
 */
export function payRateLine(pay: NonNullable<Blocks['pay']['data']>): {
  line: string;
  dated: boolean;
} {
  const now = pay.person.now;
  const base = !now || /^(member|senator)\b/i.test(now.post);
  const subject = base ? 'a year, base salary' : `a year as ${now.post}`;
  const from = pay.base.from ? formatDate(pay.base.from, 'short') : '';
  return from
    ? { line: `${subject}, rate from ${from}`, dated: true }
    : { line: subject, dated: false };
}

export interface IdentitySeat {
  key: string;
  title: string;
  detail?: string;
  electorateId?: string;
  current: boolean;
}
const stateOf = (
  seat: { jurisdiction: string; chamber: string; name: string },
  profile: {
    rosterRow?: {
      representation?: { electorate: string; state?: string | null }[];
    };
  },
) => {
  if (seat.jurisdiction !== 'federal') return null;
  if (seat.chamber === 'senate') return null;
  const state = profile.rosterRow?.representation?.find(
    (r) => r.electorate.trim().toLowerCase() === seat.name.toLowerCase(),
  )?.state;
  return state ? (jurisdictionName(state) ?? state) : null;
};
function lastDatedRepresentation(seats: PersonProfile['seats']) {
  const latest = seats
    .flatMap((seat) =>
      (seat.periods ?? []).map((period) => ({ seat, ...period })),
    )
    .sort(
      (a, b) =>
        (a.end ?? '').localeCompare(b.end ?? '') ||
        (a.start ?? '').localeCompare(b.start ?? ''),
    )
    .at(-1)?.seat;
  return latest ? [latest] : seats.slice(-1);
}
/**
 * One row a seat: "Member for Grayndler" / "New South Wales, since 2 Mar
 * 1996"; "Senator for Victoria"; a state seat names its house. A former
 * member with a last recorded seat gets one "Former member for …" row;
 * no seat at all gives no row (never "No current electorate…").
 */
export function seatRows(
  identity: Pick<PersonProfile, 'seats' | 'partyStatus' | 'rosterRow'>,
): IdentitySeat[] {
  const current = identity.seats.filter((s) => s.current);
  const shown = current.length
    ? current
    : identity.partyStatus === 'former'
      ? lastDatedRepresentation(identity.seats)
      : identity.seats;
  return shown.map((seat) => {
    const senator = seat.chamber === 'senate';
    const former = !seat.current && identity.partyStatus === 'former';
    const starts = (seat.periods ?? [])
      .map((p) => p.start)
      .filter((d): d is string => !!d)
      .sort();
    const ends = (seat.periods ?? [])
      .map((p) => p.end)
      .filter((d): d is string => !!d)
      .sort();
    const place =
      seat.jurisdiction === 'federal'
        ? senator
          ? null
          : stateOf(seat, identity)
        : chamberName(seat.chamber, seat.jurisdiction);
    const when = former
      ? starts[0] && ends.at(-1)
        ? formatYearRange(
            Number(starts[0].slice(0, 4)),
            Number(ends.at(-1)!.slice(0, 4)),
          )
        : null
      : starts[0]
        ? `since ${formatDate(starts[0], 'short')}`
        : null;
    return {
      key: seat.electorate_id,
      title: `${former ? 'Former member' : senator ? 'Senator' : 'Member'} for ${seat.name}`,
      detail: [place, when].filter(Boolean).join(', ') || undefined,
      electorateId: seat.electorate_id,
      current: seat.current,
    };
  });
}

/** Members in the ministerial diary's jurisdictions (NSW, Queensland). */
export function diaryEligible(
  identity: Pick<PersonProfile, 'seats' | 'rosterRow'>,
): boolean {
  return [
    ...identity.seats.map((s) => s.jurisdiction),
    ...(identity.rosterRow?.states ?? []),
    ...(identity.rosterRow?.representation ?? []).map((s) => s.jurisdiction),
  ].some((j) => j === 'nsw' || j === 'qld');
}

/**
 * The strip's sources: one per contributing block, each with its own date.
 * The line carries the oldest date and names the source that holds it first,
 * so nothing on the line reads fresher than it is (people.md 1.1, V3).
 */
export function stripSources(profile: Pick<ProfileView, 'blocks'>): {
  asOf: string | null;
  citation: SourceCitation[];
} {
  const b = profile.blocks;
  const entries: SourceCitation[] = [
    {
      label: 'Parliamentary service records',
      title: 'Parliamentary service records (identity)',
      asOf: b.identity.asAt,
    },
  ];
  if (votesCount(profile) !== null)
    entries.push({
      label: 'They Vote For You',
      title: 'They Vote For You (votes)',
      asOf: b.votes.asAt,
    });
  if (interestsCount(profile) !== null)
    entries.push({
      label: 'Register of interests',
      title: 'Register of interests (interests)',
      asOf: b.interests.asAt,
    });
  if (annualPay(profile) !== null)
    entries.push({
      label: 'Parliamentary Library',
      title: 'Parliamentary Library (pay)',
      asOf: b.pay.asAt,
    });
  const dated = entries.filter((e) => !!e.asOf);
  const oldest = dated.sort((a, c) =>
    String(a.asOf).localeCompare(String(c.asOf)),
  )[0];
  return {
    asOf: oldest ? String(oldest.asOf) : null,
    citation: oldest
      ? [oldest, ...entries.filter((e) => e !== oldest)]
      : entries,
  };
}

/** The follow engine's key for one bill vote (follows/markers.ts). */
export const voteRowKey = (vote: {
  jur?: string;
  date: string;
  name: string;
  stage: string;
}) => `vote:${vote.jur ?? ''}:${vote.date}:${vote.name}:${vote.stage}`;
