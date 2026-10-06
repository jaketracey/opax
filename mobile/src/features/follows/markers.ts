import { isPartialCatalog } from '../../api/validation';
import type { Catalogs } from '../../api/catalogs';
import { catalogSources, personId, profileFor } from '../../api/catalogs';
import { billName, billSentenceCase } from '../../api/bill-transforms';
import { formatCount, formatDate, formatMoney } from '../../design/format';
import { partyText } from '../../design/party';
import type { Fingerprint, Follow, FollowKind, Reading } from './store';

/**
 * Change markers for local follows, computed on this iPhone from the shared
 * catalogs the app already reads. Each marker is a small reading of one
 * published field and that field's own date. The table of markers, their
 * source fields and dates is in this folder's README.
 */
export type FollowSources = Awaited<ReturnType<Catalogs['followSources']>>;
export interface Change {
  marker: string;
  /** What changed, in plain words: "1 new declared entry". */
  text: string;
  /** Who publishes the record: "Register of Members’ Interests". */
  citation: string;
  /** The date the record gives for the new reading, if it gives one. */
  asAt: string | null;
}
export type FollowState =
  /** Markers for the record as published now, and what changed since seen. */
  | {
      status: 'ready';
      title: string;
      current: Fingerprint;
      changes: Change[];
    }
  /** The record is no longer in the published catalog. */
  | { status: 'missing' }
  /** The catalogs this follow reads are not available yet. */
  | { status: 'unavailable' };

export const kindLabels: Record<FollowKind, string> = {
  person: 'Parliamentarian',
  bill: 'Bill',
  electorate: 'Electorate',
};
/** Which shared catalogs a set of follows needs. */
export function needsFor(follows: readonly Pick<Follow, 'kind'>[]) {
  return {
    people: follows.some((f) => f.kind === 'person'),
    bills: follows.some((f) => f.kind === 'bill'),
    electorates: follows.some((f) => f.kind === 'electorate'),
  };
}

const citations = {
  roster: catalogSources.people.label,
  release: catalogSources.electorates.label,
  bills: catalogSources.bills.label,
};
const plural = (n: number, one: string, many: string) =>
  `${formatCount(n)} ${n === 1 ? one : many}`;
/** "2026Q02" → "June 2026", the last month an IPEA quarter covers. */
export function quarterEnd(quarter: string) {
  const match = /^(\d{4})Q0([1-4])$/.exec(quarter);
  if (!match) return quarter;
  return `${['March', 'June', 'September', 'December'][Number(match[2]) - 1]} ${match[1]}`;
}
// Source dates as published: calendar dates stay as they are, timestamps
// are read in the device's zone (formatDate), as every as-at line is.
const dateOf = (value: string | null | undefined) => value ?? null;
/** A marker read both times with a different value: [before, after]. */
function pairOf(
  before: Fingerprint,
  after: Fingerprint,
  key: string,
): [Reading, Reading] | null {
  const b = before[key],
    a = after[key];
  return b && a && b.value !== a.value ? [b, a] : null;
}

/** A number that went up or down, or a record that appeared or went. */
function countChange(
  before: Reading,
  after: Reading,
  words: {
    more: (n: number) => string;
    fewer: (n: number, total: number) => string;
    held: (total: number) => string;
    gone: string;
  },
) {
  if (typeof before.value === 'number' && typeof after.value === 'number') {
    const delta = after.value - before.value;
    return delta > 0 ? words.more(delta) : words.fewer(-delta, after.value);
  }
  if (typeof after.value === 'number') return words.held(after.value);
  return words.gone;
}

// ---- Parliamentarians -----------------------------------------------------

function personFingerprint(id: string, sources: FollowSources) {
  const { manifest, roster, slugs, people } = sources;
  if (!manifest || !roster || !slugs || !people) return undefined;
  let profile: ReturnType<typeof profileFor>;
  try {
    profile = profileFor(personId(id), {
      manifest,
      roster,
      slugs,
      people,
      votes: sources.votes ?? undefined,
      interestIndex: sources.interestIndex ?? undefined,
      pay: sources.pay ?? undefined,
      expenses: sources.expenses ?? undefined,
    });
  } catch {
    return null;
  }
  const identity = profile.blocks.identity.data!;
  const markers: Fingerprint = {};
  // Party and seat: the dated release and roster, as the profile shows them.
  markers.party = {
    value: `${identity.partyStatus}|${identity.party ?? ''}`,
    // "formerly Labor" reads mid-sentence: "Party now recorded as formerly Labor".
    words: partyText({
      party: identity.party,
      status: identity.partyStatus,
    }).spoken.replace(/^Formerly /, 'formerly '),
    asAt: dateOf(identity.asOf),
  };
  const seats = [...identity.seats].sort((a, b) =>
    a.electorate_id.localeCompare(b.electorate_id),
  );
  markers.seat = {
    value: seats.map((s) => s.electorate_id).join(','),
    words: seats.map((s) => s.name).join(' and '),
    asAt: dateOf(seats[0]?.as_of ?? identity.asOf),
  };
  // Declared entries: the register index's count for this member's file.
  if (sources.interestIndex && profile.blocks.interests.status !== 'error')
    markers.declarations = {
      value: profile.interestKey
        ? (sources.interestIndex.people[profile.interestKey]?.total ?? null)
        : null,
      words: registerCitation(identity.seats[0]),
      asAt: dateOf(sources.interestIndex._meta.generated),
    };
  // Recorded divisions across the member's voting records.
  if (sources.votes && profile.blocks.votes.status !== 'error')
    markers.divisions = {
      value: profile.blocks.votes.data?.total ?? null,
      words:
        [...new Set(profile.blocks.votes.sources.map((s) => s.label))].join(
          '; ',
        ) || 'They Vote For You',
      asAt: dateOf(sources.votes.meta?.latest_division_date),
    };
  // Pay: the series' as-at date, with the post and salary held now.
  const pay = profile.blocks.pay.data;
  if (sources.pay && profile.blocks.pay.status !== 'error')
    markers.pay = {
      value: pay
        ? [
            sources.pay.meta.as_of,
            pay.person.now?.post ?? '',
            pay.person.now?.salary ?? '',
          ].join('|')
        : null,
      words: pay?.person.now
        ? `${formatMoney(pay.person.now.salary)} a year as ${pay.person.now.post}`
        : 'no current pay rate',
      asAt: dateOf(sources.pay.meta.as_of),
    };
  // Expenses: the last IPEA quarter covered, with the recorded total.
  const expenses = profile.blocks.expenses.data;
  if (sources.expenses && profile.blocks.expenses.status !== 'error')
    markers.expenses = {
      value: expenses
        ? `${expenses.coverage.to}|${Math.round(expenses.person.total)}`
        : null,
      words: expenses ? formatMoney(expenses.person.total) : undefined,
      asAt: dateOf(sources.expenses.meta.generated),
    };
  return { title: identity.name, markers };
}
// The register named by the member's seat (registerSourceLabelFor's names).
function registerCitation(
  seat: { jurisdiction: string; chamber: string } | undefined,
) {
  if (seat?.jurisdiction === 'qld')
    return 'Queensland Register of Members’ Interests';
  if (seat?.jurisdiction === 'federal' && seat.chamber === 'senate')
    return 'Register of Senators’ Interests';
  if (seat?.jurisdiction === 'federal' && seat.chamber === 'representatives')
    return 'Register of Members’ Interests';
  return 'Register of interests';
}
function personChanges(before: Fingerprint, after: Fingerprint): Change[] {
  const out: Change[] = [];
  const changed = (key: string) => pairOf(before, after, key);
  const declarations = changed('declarations');
  if (declarations) {
    const [b, a] = declarations;
    out.push({
      marker: 'declarations',
      text: countChange(b, a, {
        more: (n) =>
          `${plural(n, 'new declared entry', 'new declared entries')}`,
        fewer: (n) =>
          `${formatCount(n)} fewer declared ${n === 1 ? 'entry' : 'entries'}`,
        held: (t) =>
          `Register file now held, with ${plural(t, 'declared entry', 'declared entries')}`,
        gone: 'No register file is held now',
      }),
      citation: a.words ?? 'Register of interests',
      asAt: a.asAt,
    });
  }
  const divisions = changed('divisions');
  if (divisions) {
    const [b, a] = divisions;
    out.push({
      marker: 'divisions',
      text: countChange(b, a, {
        more: (n) =>
          plural(n, 'new recorded division', 'new recorded divisions'),
        fewer: (_n, t) => `Recorded divisions revised to ${formatCount(t)}`,
        held: (t) =>
          `Voting record now held, with ${plural(t, 'recorded division', 'recorded divisions')}`,
        gone: 'No voting record is held now',
      }),
      citation: a.words ?? 'They Vote For You',
      asAt: a.asAt,
    });
  }
  const party = changed('party');
  if (party)
    out.push({
      marker: 'party',
      text: `Party now recorded as ${party[1].words}; was ${party[0].words}`,
      citation: citations.roster,
      asAt: party[1].asAt,
    });
  const seat = changed('seat');
  if (seat) {
    const [b, a] = seat;
    out.push({
      marker: 'seat',
      text: !a.words
        ? `No current seat recorded; was ${b.words}`
        : !b.words
          ? `Now recorded for ${a.words}`
          : `Seat now recorded as ${a.words}; was ${b.words}`,
      citation: citations.release,
      asAt: a.asAt,
    });
  }
  const pay = changed('pay');
  if (pay) {
    const [b, a] = pay;
    const [, postB, salaryB] = String(b.value ?? '').split('|');
    const [, postA, salaryA] = String(a.value ?? '').split('|');
    out.push({
      marker: 'pay',
      text:
        a.value === null
          ? 'No covered pay record is held now'
          : b.value === null || postA !== postB || salaryA !== salaryB
            ? `Pay now recorded as ${a.words}`
            : 'Pay records updated',
      citation: 'Remuneration Tribunal; Parliamentary Handbook',
      asAt: a.asAt,
    });
  }
  const expenses = changed('expenses');
  if (expenses) {
    const [b, a] = expenses;
    const [toB] = String(b.value ?? '').split('|');
    const [toA] = String(a.value ?? '').split('|');
    out.push({
      marker: 'expenses',
      text:
        a.value === null
          ? 'No expense summary is held now'
          : b.value === null || toA !== toB
            ? `Expenses now cover to ${quarterEnd(toA!)}: ${a.words} recorded`
            : `Recorded expenses revised to ${a.words}`,
      citation: 'Independent Parliamentary Expenses Authority',
      asAt: a.asAt,
    });
  }
  return out;
}

// ---- Bills ----------------------------------------------------------------

function billFingerprint(key: string, sources: FollowSources) {
  if (!sources.bills) return undefined;
  const row = sources.bills.bills.find((b) => b.key === key);
  if (!row) return null;
  const generated = dateOf(sources.bills.generated_at);
  const markers: Fingerprint = {
    status: {
      value: row.status,
      words: billSentenceCase(row.status).toLowerCase(),
      asAt: row.status_as_of,
    },
    moved: { value: row.status_as_of, asAt: row.status_as_of },
    divisions: { value: row.divisions, asAt: generated },
    speeches: { value: row.speeches, asAt: generated },
  };
  return { title: billName(row), markers };
}
function billChanges(before: Fingerprint, after: Fingerprint): Change[] {
  const out: Change[] = [];
  const changed = (key: string) =>
    before[key] && after[key] && before[key]!.value !== after[key]!.value;
  const source = (marker: string, text: string): Change => ({
    marker,
    text,
    citation: citations.bills,
    asAt: after[marker]!.asAt,
  });
  if (changed('status'))
    out.push(
      source(
        'status',
        `Now ${after.status!.words}; was ${before.status!.words}`,
      ),
    );
  else if (changed('moved') && after.moved!.value)
    out.push(
      source(
        'moved',
        `New stage recorded on ${formatDate(String(after.moved!.value))}`,
      ),
    );
  for (const [marker, one, many] of [
    ['divisions', 'new division', 'new divisions'],
    ['speeches', 'new speech', 'new speeches'],
  ] as const)
    if (changed(marker)) {
      const delta =
        Number(after[marker]!.value) - Number(before[marker]!.value);
      out.push(
        source(
          marker,
          delta > 0
            ? plural(delta, one, many)
            : `${marker === 'divisions' ? 'Divisions' : 'Speeches'} recorded revised to ${formatCount(Number(after[marker]!.value))}`,
        ),
      );
    }
  return out;
}

// ---- Electorates ----------------------------------------------------------

function electorateFingerprint(id: string, sources: FollowSources) {
  if (!sources.electorates) return undefined;
  const seat = sources.electorates.electorates.find(
    (s) => s.electorate_id === id,
  );
  if (!seat) return null;
  const people = [...seat.representatives].sort((a, b) =>
    a.person_id.localeCompare(b.person_id),
  );
  const markers: Fingerprint = {
    representatives: {
      value:
        seat.representation_status === 'verified'
          ? people.map((r) => r.person_id).join(',')
          : null,
      words: people.map((r) => r.person.name).join('|'),
      asAt: seat.representation_as_of,
    },
    status: { value: seat.status, asAt: seat.representation_as_of },
  };
  if (seat.latest_election !== undefined || seat.election_count !== undefined)
    markers.election = {
      value: `${seat.latest_election ?? ''}|${seat.election_count ?? 0}`,
      asAt: seat.latest_election ?? null,
    };
  return { title: seat.name, markers };
}
const list = (names: string[]) =>
  names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
function electorateChanges(before: Fingerprint, after: Fingerprint): Change[] {
  const out: Change[] = [];
  const changed = (key: string) =>
    before[key] && after[key] && before[key]!.value !== after[key]!.value;
  const source = (marker: string, text: string): Change => ({
    marker,
    text,
    citation: citations.release,
    asAt: after[marker]!.asAt,
  });
  if (changed('representatives')) {
    const b = before.representatives!,
      a = after.representatives!;
    if (a.value === null)
      out.push(
        source('representatives', 'No verified representation is recorded now'),
      );
    else if (b.value === null)
      out.push(
        source(
          'representatives',
          `Verified representation now recorded: ${list((a.words ?? '').split('|').filter(Boolean))}`,
        ),
      );
    else {
      const pair = (r: Reading) => {
        const ids = String(r.value).split(',');
        const names = (r.words ?? '').split('|');
        return new Map(ids.map((id, i) => [id, names[i] ?? '']));
      };
      const was = pair(b),
        now = pair(a);
      const joined = [...now].filter(([id]) => !was.has(id)).map(([, n]) => n);
      const left = [...was].filter(([id]) => !now.has(id)).map(([, n]) => n);
      out.push(
        source(
          'representatives',
          joined.length === 1 && left.length === 1
            ? `Representative now recorded as ${joined[0]}; was ${left[0]}`
            : [
                joined.length ? `${list(joined)} now recorded` : null,
                left.length ? `${list(left)} no longer recorded` : null,
              ]
                .filter(Boolean)
                .join('; '),
        ),
      );
    }
  }
  if (changed('status'))
    out.push(
      source(
        'status',
        after.status!.value === 'historical'
          ? 'Now recorded as abolished'
          : 'Now recorded as a current seat',
      ),
    );
  if (changed('election')) {
    const [latestB] = String(before.election!.value).split('|');
    const [latestA] = String(after.election!.value).split('|');
    out.push(
      source(
        'election',
        latestA && latestA !== latestB
          ? `New election result: ${formatDate(latestA)}`
          : 'Election records updated',
      ),
    );
  }
  return out;
}

// ---- Shared ---------------------------------------------------------------

const fingerprints = {
  person: personFingerprint,
  bill: billFingerprint,
  electorate: electorateFingerprint,
};
const changesFor = {
  person: personChanges,
  bill: billChanges,
  electorate: electorateChanges,
};
/** One follow against the published record: its markers and what changed. */
export function followState(
  follow: Pick<Follow, 'kind' | 'id' | 'seen'>,
  sources: FollowSources | null,
): FollowState {
  // Also defend callers holding decoded catalogs directly, outside ApiClient.
  // Omitted markers stay last-seen: markSeen merges only readable markers.
  const complete = sources
    ? (Object.fromEntries(
        Object.entries(sources).map(([key, value]) => [
          key,
          isPartialCatalog(value) ? null : value,
        ]),
      ) as FollowSources)
    : null;
  const reading = complete
    ? fingerprints[follow.kind](follow.id, complete)
    : undefined;
  if (reading === undefined) return { status: 'unavailable' };
  if (reading === null) return { status: 'missing' };
  return {
    status: 'ready',
    title: reading.title,
    current: reading.markers,
    changes: follow.seen
      ? changesFor[follow.kind](follow.seen, reading.markers)
      : [],
  };
}
