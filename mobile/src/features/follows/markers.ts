import { ApiError } from '../../api/errors';
import { isPartialCatalog } from '../../api/validation';
import type { Catalogs } from '../../api/catalogs';
import { catalogSources, personId, profileFor } from '../../api/catalogs';
import { billName, billSentenceCase } from '../../api/bill-transforms';
import { partyMembers } from '../../api/party-page';
import { nameKey } from '../../api/ids';
import { formatMoney } from '../../design/format';
import { formerMember, partySlug, partyText } from '../../design/party';
import {
  changesFor,
  currentKeys,
  questionType,
  voteAction,
  type Change,
  type FollowRecord,
  type QuestionType,
} from './changes';
import type { Fingerprint, Follow, FollowKind } from './store';

export type { Change } from './changes';
export type FollowSources = Awaited<ReturnType<Catalogs['followSources']>>;
export type FollowState =
  | {
      status: 'ready';
      title: string;
      current: Fingerprint;
      keys: string[];
      changes: Change[];
      stale?: boolean;
      savedAt?: number | null;
    }
  | { status: 'missing' }
  | { status: 'unavailable' };
export const kindLabels: Record<FollowKind, string> = {
  person: 'Person',
  party: 'Party',
  bill: 'Bill',
  electorate: 'Electorate',
};
export function needsFor(follows: readonly Pick<Follow, 'kind'>[]) {
  return {
    parties: follows.some((f) => f.kind === 'party'),
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
export function quarterEnd(quarter: string) {
  const match = /^(\d{4})Q0([1-4])$/.exec(quarter);
  return match
    ? `${['March', 'June', 'September', 'December'][Number(match[2]) - 1]} ${match[1]}`
    : quarter;
}
const dateOf = (value: string | null | undefined) => value ?? null;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
/** Optional future fields are consumed in place; this module never fetches. */
function recordsFrom(
  value: unknown,
  kind: FollowRecord['kind'],
): FollowRecord[] | undefined {
  if (value === undefined || value === null) return undefined;
  const rows = Array.isArray(value) ? value : [value];
  return rows.flatMap((r): FollowRecord[] => {
    if (!object(r) || typeof r.date !== 'string') return [];
    const key = r.key ?? r.id ?? r.slug;
    if (typeof key !== 'string' && kind !== 'stage') return [];
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const record: FollowRecord = {
      key: String(key ?? `stage:${r.stage}:${r.chamber}:${r.date}`),
      kind,
      date: r.date,
      added: str(r.added),
      title:
        str(r.short_title) ??
        str(r.title) ??
        str(r.description) ??
        str(r.name) ??
        str(r.stage) ??
        '',
      stage: str(r.stage) ?? (kind === 'stage' ? str(r.name) : undefined),
      chamber: str(r.chamber) ?? str(r.house),
      outcome: str(r.outcome),
      name: str(r.speaker_name) ?? str(r.speaker) ?? str(r.name),
      category: str(r.category) ?? str(r.bucket),
      operation:
        r.kind === 'deletion' || r.operation === 'deletion'
          ? 'deletion'
          : 'addition',
      billKey: str(r.bill_key),
      divisionKey: kind === 'division' ? String(key) : str(r.division_key),
      url: str(r.url),
    };
    return [record];
  });
}

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
      bills: sources.bills ?? undefined,
    });
  } catch (error) {
    // Only a person the release does not hold is gone. Records out of step
    // between releases, or an identity that needs review, are a check that
    // could not be made: never "No longer in OPAX" for a fetch problem.
    return error instanceof ApiError && error.code === 'not-found'
      ? null
      : undefined;
  }
  const identity = profile.blocks.identity.data!;
  const markers: Fingerprint = {};
  // Party and seat: the dated release and roster, as the profile shows them.
  markers.party = {
    value: `${identity.partyStatus}|${identity.party ?? ''}`,
    // The label never carries the status, so a member who leaves reads
    // "Party now recorded as Labor, former member".
    words: [
      partyText({
        party: identity.party,
        status: identity.partyStatus,
      }).spoken,
      formerMember(identity.partyStatus)?.toLowerCase(),
    ]
      .filter(Boolean)
      .join(', '),
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
  const voteData = profile.blocks.votes.data;
  if (sources.votes && profile.blocks.votes.status !== 'error') {
    const records: FollowRecord[] = [];
    for (const position of ['for', 'against'] as const)
      for (const vote of voteData?.[position] ?? []) {
        const raw = vote as typeof vote & {
          key?: string;
          division_key?: string;
          question_type?: QuestionType;
          url?: string;
        };
        const kind = questionType(raw);
        if (!voteAction(kind, position)) continue;
        records.push({
          key:
            raw.key ??
            raw.division_key ??
            `vote:${vote.jur ?? ''}:${vote.date}:${vote.name}:${vote.stage}`,
          kind: 'vote',
          date: vote.date,
          title: vote.name,
          stage: vote.stage,
          position,
          question_type: kind,
          ...(vote.billKey ? { billKey: vote.billKey } : {}),
          ...(raw.division_key ? { divisionKey: raw.division_key } : {}),
          url:
            raw.url ??
            `https://theyvoteforyou.org.au/search?query=${encodeURIComponent(vote.name)}`,
        });
      }
    markers.divisions!.records = records;
  }
  const register =
    profile.interestKey && sources.interestIndex?.people[profile.interestKey];
  if (register && markers.declarations) {
    const rich = register as typeof register & {
      latest?: unknown[];
      items?: unknown[];
    };
    const records = recordsFrom(rich.latest ?? rich.items, 'register');
    if (records)
      markers.declarations.records = records
        .sort((a, b) => (b.added ?? b.date).localeCompare(a.added ?? a.date))
        .slice(0, 20)
        .map((r) => ({
          ...r,
          slug: profile.slug ?? id,
        }));
  }
  // Bills are used only if the shared follow sources already include them.
  if (sources.bills) {
    const records = sources.bills.bills
      .flatMap((bill) => {
        const raw = bill as typeof bill & { sponsor_person_id?: string };
        if (
          !bill.introduced ||
          !(
            (!!raw.sponsor_person_id &&
              (raw.sponsor_person_id === id ||
                raw.sponsor_person_id === identity.legacyPersonId)) ||
            bill.sponsor === identity.name
          )
        )
          return [];
        return [
          {
            key: bill.key,
            kind: 'bill' as const,
            date: bill.introduced,
            title: billName(bill),
            billKey: bill.key,
            chamber: bill.originating_house ?? undefined,
          },
        ];
      })
      .sort(
        (a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key),
      )
      .slice(0, 10);
    markers.introduced = {
      value: records.length,
      asAt: null,
      records,
      words: citations.bills,
    };
  }
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
function billFingerprint(key: string, sources: FollowSources) {
  if (!sources.bills) return undefined;
  const row = sources.bills.bills.find((b) => b.key === key);
  if (!row) return null;
  const markers: Fingerprint = {
    status: {
      value: row.status,
      words: billSentenceCase(row.status).toLowerCase(),
      asAt: row.status_as_of,
    },
    moved: { value: row.status_as_of, asAt: row.status_as_of },
    divisions: {
      value: row.divisions,
      asAt: dateOf(sources.bills.generated_at),
    },
    speeches: { value: row.speeches, asAt: dateOf(sources.bills.generated_at) },
  };
  const rich = row as typeof row & {
    latest_stage?: unknown;
    latest_division?: unknown;
    latest_speech?: unknown;
  };
  for (const [marker, kind, value] of [
    ['moved', 'stage', rich.latest_stage],
    ['divisions', 'division', rich.latest_division],
    ['speeches', 'speech', rich.latest_speech],
  ] as const) {
    const records = recordsFrom(value, kind);
    if (records)
      markers[marker]!.records = records
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 1)
        .map((r) => ({ ...r, billKey: key }));
  }
  return { title: billName(row), markers };
}
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
function partyFingerprint(id: string, sources: FollowSources) {
  if (!sources.money) return undefined;
  const node = sources.money.nodes.find(
    (n) => n.kind === 'party' && partySlug(n.label) === id,
  );
  if (!node) return null;
  const years = Object.keys(node.byYear).sort().reverse();
  const markers: Fingerprint = {
    returns: {
      value: years[0] ?? null,
      asAt: sources.money.meta.generated,
      words: 'AEC disclosure returns, CC BY 4.0',
      records: years.slice(0, 1).map((year) => ({
        key: `return:${year}`,
        kind: 'return',
        title: financialYear(year),
        date: sources.money!.meta.generated,
      })),
    },
  };
  if (sources.people && sources.roster && sources.slugs && sources.manifest) {
    const personIds = new Map(
      sources.people.people.flatMap((person) =>
        [person.name, ...person.aliases].map(
          (name) => [nameKey(name), person.person_id] as const,
        ),
      ),
    );
    const rosterIds = new Map(
      sources.roster.people
        .filter((person) => person.pid)
        .map((person) => [nameKey(person.name), `roster:${person.pid}`]),
    );
    const members = [
      ...new Map(
        partyMembers(
          node.label,
          sources.roster,
          sources.people,
          sources.slugs,
          sources.manifest,
        ).current.map((member): [string, FollowRecord] => {
          const key =
            personIds.get(nameKey(member.name)) ??
            rosterIds.get(nameKey(member.name)) ??
            member.slug;
          return [
            key,
            {
              key,
              kind: 'member',
              name: member.name,
              title: member.name,
              slug: member.slug,
              date: member.asAt ?? sources.roster!.meta.generated,
            },
          ];
        }),
      ).values(),
    ];
    markers.members = {
      value: members
        .map((m) => m.key)
        .sort()
        .join(','),
      records: members,
      asAt: sources.roster.meta.generated,
      words: citations.roster,
    };
  }
  return { title: node.label, markers };
}
function financialYear(year: string) {
  return /^\d{4}$/.test(year)
    ? `${Number(year) - 1}–${year.slice(-2)}`
    : year.replace('-', '–');
}
const fingerprints = {
  party: partyFingerprint,
  person: personFingerprint,
  bill: billFingerprint,
  electorate: electorateFingerprint,
};
export function followState(
  follow: Pick<Follow, 'kind' | 'id' | 'seen'> &
    Pick<Partial<Follow>, 'seenKeys'>,
  sources: FollowSources | null,
): FollowState {
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
    keys: currentKeys(reading.markers),
    changes: changesFor(follow, reading.markers).map((change) => ({
      ...change,
      ...(follow.kind === 'electorate' &&
      change.marker === 'representatives' &&
      change.asAt &&
      sources?.electorates?.electorates.find(
        (s) => s.electorate_id === follow.id,
      )?.representatives.length === 1
        ? (() => {
            const person = sources.electorates!.electorates.find(
              (s) => s.electorate_id === follow.id,
            )!.representatives[0]!;
            return {
              record: {
                key: person.person_id,
                kind: 'member' as const,
                date: change.asAt!,
                title: person.person.name,
                slug: person.person_id,
              },
            };
          })()
        : {}),
      stale: sources?.stale || !!sources?.error,
      savedAt: sources?.savedAt,
    })),
    stale: sources?.stale || !!sources?.error,
    savedAt: sources?.savedAt,
  };
}
