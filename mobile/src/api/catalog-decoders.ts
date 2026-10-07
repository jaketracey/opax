import { ApiError } from './errors';
import { decodeBoundary, type Boundary } from './electorate-geometry';
import {
  array,
  boolean,
  count,
  date,
  dict,
  exact,
  invalid,
  matching,
  nonempty,
  nonemptyArray,
  nullable,
  number,
  object,
  rows,
  records,
  isPartialCatalog,
  markPartial,
  filterRows,
  filterRecords,
  uniqueRows,
  catalogWarning,
  optional,
  shape,
  text,
  url,
  type Decoded,
  type Decoder,
} from './validation';
import {
  billKey,
  electorateId,
  interestKey,
  legacyPersonId,
  payId,
  personId,
  personSlug,
  portraitKey,
  rosterId,
  voteKey,
} from './ids';

const strings = array(text);
const maybeText = optional(nullable(text));
const maybeDate = optional(nullable(date));
const source = shape({
  source_id: nonempty,
  label: nonempty,
  url,
  fetched_at: optional(date),
  licence: optional(text),
});
export type Source = Decoded<typeof source>;
const period = shape({
  start: nullable(date),
  end: nullable(date),
  party: optional(nullable(text)),
});
const seatObservation = shape({
  electorate_id: electorateId,
  name: nonempty,
  current: boolean,
  as_of: nullable(date),
  party: nullable(text),
  jurisdiction: nonempty,
  chamber: nonempty,
  url: nonempty,
  periods: optional(array(period)),
});
export type SeatObservation = Decoded<typeof seatObservation>;
const identity = shape({
  person_id: personId,
  legacy_person_id: optional(rosterId),
  name: nonempty,
  aliases: strings,
  jurisdiction: optional(nonempty),
  sources: strings,
  source_url: optional(nullable(url)),
});
const electoratePerson = shape({
  person_id: personId,
  legacy_person_id: optional(rosterId),
  name: nonempty,
  aliases: strings,
  jurisdiction: optional(nonempty),
  sources: strings,
  source_url: optional(nullable(url)),
  electorates: array(seatObservation),
});
export type ElectoratePerson = Decoded<typeof electoratePerson>;
const rosterPerson = shape({
  name: nonempty,
  pid: optional(rosterId),
  party: maybeText,
  party_now: optional(text),
  current: optional(boolean),
  speeches: optional(count),
  full: optional(text),
  states: optional(strings),
  chambers: optional(strings),
  first: optional(count),
  last: optional(count),
  representation: optional(
    array(
      shape({
        jurisdiction: nonempty,
        chamber: nonempty,
        electorate: text,
        state: optional(nullable(text)),
        basis: optional(text),
      }),
    ),
  ),
});
export const decodeRoster = shape({
  meta: shape({ generated: date }),
  people: rows(rosterPerson, 'rosterPerson'),
});
export type Roster = Decoded<typeof decodeRoster>;
export type RosterPerson = Decoded<typeof rosterPerson>;
const releaseMeta = shape({
  generated: date,
  release_id: matching(/^[a-f0-9]{16}$/),
});
const coverageRow = shape({
  roster_dates: array(date),
  roster_members: count,
  roster_constituencies: count,
  electorates: count,
});
const manifestShape = shape({
  release_id: matching(/^[a-f0-9]{16}$/),
  generated: date,
  index_url: nonempty,
  people_url: nonempty,
  sources: array(source),
  files: dict(matching(/^[a-f0-9]{64}$/)),
  coverage: shape({ jurisdictions: dict(coverageRow), notes: strings }),
});
export function decodeManifest(v: unknown) {
  const m = manifestShape(v);
  if (
    m.index_url !== `/electorates/releases/${m.release_id}/index.json` ||
    m.people_url !== `/electorates/releases/${m.release_id}/people.json`
  )
    invalid('The electorate release paths do not match its ID.');
  return m;
}
export type Manifest = ReturnType<typeof decodeManifest>;
const peopleShape = shape({
  meta: releaseMeta,
  people: uniqueRows(electoratePerson, (p) => p.person_id, 'electoratePerson'),
});
export function decodePeople(v: unknown) {
  const p = peopleShape(v);
  return p;
}
export type PeopleCatalog = Decoded<typeof decodePeople>;
export const decodeSlugs = shape({
  generated: date,
  slugs: records(nonempty, personSlug),
});
export type Slugs = Decoded<typeof decodeSlugs>;
const electorateFields = {
  electorate_id: electorateId,
  name: nonempty,
  slug: personSlug,
  detail_url: matching(
    /^\/electorates\/releases\/[a-f0-9]{16}\/el_[a-f0-9]{24}\.json$/,
  ),
  representation_as_of: nullable(date),
  representation_status: nonempty,
  representatives: array(
    shape({ party: nullable(text), person_id: personId, person: identity }),
  ),
  jurisdiction: nonempty,
  chamber: nonempty,
  state_code: nonempty,
  status: nonempty,
  capacity: count,
  sources: strings,
  url: nonempty,
  // Local follows compare these to notice a new election result without
  // reading each seat's detail file.
  latest_election: optional(nullable(date)),
  election_count: optional(count),
};
const electorate = shape(electorateFields);
export type Electorate = Decoded<typeof electorate>;
const indexShape = shape({
  meta: releaseMeta,
  electorates: uniqueRows(electorate, (s) => s.electorate_id, 'electorate'),
});
export function decodeElectorateIndex(v: unknown) {
  const index = indexShape(v);
  // If no seat belongs to the declared release, the envelope itself is
  // crossed. Reject it so a refresh cannot replace a good index with an
  // empty one. One crossed row beside a healthy seat is still isolated.
  if (
    index.electorates.length &&
    index.electorates.every(
      (s) => s.detail_url.split('/')[3] !== index.meta.release_id,
    )
  )
    invalid('The seat release metadata does not match its rows.');
  index.electorates = filterRows(
    index.electorates,
    (s) =>
      s.detail_url ===
        `/electorates/releases/${index.meta.release_id}/${s.electorate_id}.json` &&
      s.representatives.every((r) => r.person_id === r.person.person_id),
    'electorates.identity',
  );
  markPartial(index, isPartialCatalog(index.electorates));
  return index;
}
export type ElectorateIndex = Decoded<typeof decodeElectorateIndex>;
const candidate = shape({
  name: nonempty,
  party: nullable(text),
  person_id: nullable(personId),
  elected: boolean,
  ballot_position: nullable(count),
  votes: array(
    shape({
      kind: nonempty,
      votes: count,
      denominator: nullable(count),
      sources: strings,
    }),
  ),
});
const election = shape({
  election: shape({ poll_date: date, kind: nonempty, name: nonempty }),
  candidates: array(candidate),
  sources: strings,
  election_id: nonempty,
  status: nonempty,
});
const electorateShape = shape({
  ...electorateFields,
  // Each outline is decoded on its own in decodeElectorate.
  boundaries: array((v): unknown => v),
  elections: array(election),
  sources: dict(source),
  demographics: array(
    shape({
      year: count,
      vintage: nonempty,
      note: text,
      indicators: dict(nullable(number)),
      sources: strings,
    }),
  ),
  relations: array(
    shape({
      kind: nonempty,
      related_id: electorateId,
      related: shape({
        electorate_id: electorateId,
        name: nonempty,
        jurisdiction: nonempty,
        chamber: nonempty,
        state_code: nonempty,
        slug: personSlug,
      }),
      sources: strings,
      vintage: text,
    }),
  ),
  rosters: array(
    shape({
      as_of: date,
      capacity: count,
      complete: boolean,
      members: array(shape({ person_id: personId, party: nullable(text) })),
      sources: strings,
    }),
  ),
  terms: array(
    shape({
      person_id: personId,
      start: nullable(date),
      end: nullable(date),
      start_precision: nonempty,
      end_precision: nonempty,
      observed_through: date,
      sources: strings,
      source_party_label: nullable(text),
      party_periods: array(period),
    }),
  ),
  people: dict(identity, personId),
});
export function decodeElectorate(v: unknown) {
  const { boundaries: outlines, ...s } = electorateShape(v);
  if (
    s.representatives.some((r) => r.person_id !== r.person.person_id) ||
    Object.entries(s.people).some(([id, p]) => id !== p.person_id)
  )
    invalid('The seat identities do not match.');
  // Display outlines enhance a single valid seat record. Missing outlines do
  // not change a representation, total or latest fact. Keep ios/app's ability
  // to read the seat without them, while flagging the incomplete display data.
  const boundaries: Boundary[] = [];
  for (const outline of outlines) {
    let boundary: Boundary | null;
    try {
      boundary = decodeBoundary(outline);
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'invalid-data')
        throw error;
      boundary = null;
    }
    if (boundary?.electorate_id === s.electorate_id) boundaries.push(boundary);
    else
      catalogWarning(
        `Skipped a malformed display outline for ${s.electorate_id}`,
      );
  }
  return markPartial(
    { ...s, boundaries },
    isPartialCatalog(s) || boundaries.length !== outlines.length,
  );
}
export type ElectorateDetail = Decoded<typeof decodeElectorate>;
const billFields = {
  key: billKey,
  title: nonempty,
  short_title: nullable(text),
  jurisdiction: nonempty,
  parliament: nullable(count),
  introduced: nullable(date),
  originating_house: nullable(text),
  status: nonempty,
  status_as_of: nullable(date),
  sponsor: nullable(text),
  sponsor_party: nullable(text),
  portfolio: nullable(text),
  aliases: optional(strings),
};
const bill = shape({
  ...billFields,
  has_summary: boolean,
  divisions: count,
  speeches: count,
  acts: count,
  summary_version: nullable(count),
});
export type Bill = Decoded<typeof bill>;
const partyCoverage = dict(count);
export const decodeBillIndex = shape({
  generated_at: date,
  count,
  meta: shape({
    party_basis_note: nonempty,
    party_basis: nonempty,
    party_coverage: partyCoverage,
  }),
  bills: rows(bill, 'bill'),
});
export type BillIndex = Decoded<typeof decodeBillIndex>;
const billSource = shape({
  kind: nonempty,
  url,
  licence: nullable(text),
  document_date: nullable(date),
});
const summary = shape({
  version: count,
  basis: nonempty,
  attribution: nonempty,
  describes_version: nonempty,
  as_of: nullable(date),
  sentences: strings,
  changes: strings,
  affected: text,
  model: nonempty,
  generated_at: date,
});
const division = shape({
  key: nonempty,
  date,
  house: nonempty,
  question: text,
  stage: nullable(text),
  ayes: count,
  noes: count,
  outcome: nonempty,
  party_splits: dict(shape({ ayes: count, noes: count })),
  party_coverage: partyCoverage,
  paired: count,
  url,
});
const speech = shape({
  slug: nonempty,
  speaker: nonempty,
  party: nullable(text),
  state: nonempty,
  date,
  stage_hint: nullable(text),
  brief: nullable(text),
});
export const decodeBill = shape({
  ...billFields,
  consultation: optional(
    nullable(shape({ url, opens: date, closes: nullable(date), note: text })),
  ),
  related: optional(
    array(
      shape({
        kind: nonempty,
        key: billKey,
        relation: nonempty,
        title: nonempty,
        note: text,
      }),
    ),
  ),
  became: optional(nullable(billKey)),
  sponsor_person_id: nullable(rosterId),
  key_dates: array(
    shape({ stage: nonempty, date, house: nullable(text), url: nullable(url) }),
  ),
  sources: array(billSource),
  summary: nullable(summary),
  divisions: array(division),
  speeches: array(speech),
  acts: array(
    shape({ title: nonempty, frl_uri: url, assent_date: nullable(date) }),
  ),
});
export type BillDetail = Decoded<typeof decodeBill>;
const voteBill = shape({
  name: nonempty,
  stage: text,
  date,
  jur: optional(nonempty),
  rebels: optional(count),
});
const vote = shape({
  name: nonempty,
  party: nullable(text),
  jurisdiction: nonempty,
  house: nonempty,
  ayes: count,
  noes: count,
  divisions_total: count,
  years: array(count),
  for: array(voteBill),
  against: array(voteBill),
});
export type VoteRecord = Decoded<typeof vote>;
export type VoteBill = Decoded<typeof voteBill>;
// The name bridge is structural: losing it would enable a legacy-ID subtotal.
const recordsOfVoteNames = dict(array(voteKey));
const votesMeta = shape({
  content_changed_at: date,
  latest_division_date: nullable(date),
  latest_division_date_by_jurisdiction: dict(nullable(date)),
  schema: count,
});
export type VotesMeta = Decoded<typeof votesMeta>;
export interface Votes {
  records: Record<string, VoteRecord>;
  names: Record<string, string[]>;
  meta: VotesMeta | null;
}
export function decodeVotes(v: unknown): Votes {
  const raw = object(v);
  let decoded = records(
    vote,
    voteKey,
    'votes',
  )(
    Object.fromEntries(
      Object.entries(raw).filter(
        ([key]) => key !== '_names' && key !== '_meta',
      ),
    ),
  );
  let names = recordsOfVoteNames(raw._names);
  const missing = (key: string) => !Object.hasOwn(decoded, key);
  // An absent raw key is a broken structural reference. A rejected vote row
  // makes the person's entire name entry unavailable; never sum half a person.
  if (
    Object.values(names).some((keys) =>
      keys.some((key) => missing(key) && !Object.hasOwn(raw, key)),
    )
  )
    invalid('The voting name index points to a missing record.');
  // Selectors also join by legacy ID. Quarantine every row in an affected
  // person's group so that bypass cannot restore a subtotal. Propagate across
  // aliases sharing a key before applying the combined loss budget.
  const unavailable = new Set<string>();
  let expanded: boolean;
  do {
    expanded = false;
    for (const keys of Object.values(names)) {
      if (keys.some((key) => missing(key) || unavailable.has(key)))
        for (const key of keys)
          if (!unavailable.has(key)) {
            unavailable.add(key);
            expanded = true;
          }
    }
  } while (expanded);
  decoded = filterRecords(
    decoded,
    (key) => !unavailable.has(key),
    'votes.person',
  );
  names = filterRecords(
    names,
    (_name, keys) => !keys.some((key) => unavailable.has(key)),
    'votes.names',
  );
  const meta = raw._meta == null ? null : votesMeta(raw._meta);
  if (meta && meta.schema !== 1) invalid('The voting schema is unsupported.');
  return markPartial(
    { records: decoded, names, meta },
    isPartialCatalog(decoded) || isPartialCatalog(names),
  );
}
const tie = shape({
  organisation: nonempty,
  kind: nonempty,
  kinds: strings,
  donor_id: optional(text),
  industry: maybeText,
});
const registerRow = shape({
  holder: nonempty,
  description: text,
  kind: nonempty,
  page: optional(nullable(count)),
  ocr: optional(count),
  date: maybeDate,
});
const detailTie = shape({
  organisation: nonempty,
  kind: nonempty,
  kinds: strings,
  donor_id: optional(text),
  industry: maybeText,
  flows: optional(
    array(shape({ party: nonempty, total: number, from: count, to: count })),
  ),
  fits_url: optional(url),
  lobbyist_jurisdictions: optional(strings),
  register: shape({
    holder: nonempty,
    category: nonempty,
    description: text,
    kind: nonempty,
    date: nullable(date),
    url,
    page: optional(nullable(count)),
  }),
});
export const decodeInterestIndex = shape({
  _meta: shape({ generated: date, rows: count, people: count }),
  _by_name: records(interestKey),
  people: records(shape({ name: nonempty, total: count }), interestKey),
});
export type InterestIndex = Decoded<typeof decodeInterestIndex>;
export const decodeInterest = shape({
  name: nonempty,
  jurisdiction: nonempty,
  chamber: nonempty,
  parliament: count,
  source_url: url,
  as_at: date,
  statement_date: optional(date),
  total: count,
  ocr_rows: count,
  unread_pages: optional(count),
  alterations: shape({ added: count, deleted: count }),
  buckets: dict(shape({ count, items: array(registerRow) })),
  ties: optional(array(detailTie)),
});
export type InterestDetail = Decoded<typeof decodeInterest>;
const recentDeclaration = shape({
  id: count,
  person_id: interestKey,
  name: nonempty,
  jurisdiction: nonempty,
  chamber: nonempty,
  parliament: count,
  holder: nonempty,
  bucket: nonempty,
  kind: nonempty,
  date,
  description: text,
  url,
  page: nullable(count),
  ties: optional(array(tie)),
});
export const decodeRecentInterests = shape({
  meta: shape({
    generated: date,
    source: nonempty,
    rows: count,
    available: count,
    limit: count,
  }),
  items: rows(recentDeclaration, 'recentDeclaration'),
});
export type RecentInterests = Decoded<typeof decodeRecentInterests>;
const donorTie = shape({
  id: interestKey,
  name: nonempty,
  jurisdiction: nonempty,
  chamber: nonempty,
  parliament: count,
  holder: nonempty,
  category: nonempty,
  description: text,
  kind: nonempty,
  date: nullable(date),
  url,
});
export const decodeInterestTies = shape({
  meta: shape({
    generated: date,
    source: nonempty,
    matching: nonempty,
    donors: count,
    rows: count,
  }),
  donors: records(array(donorTie)),
});
export type InterestTies = Decoded<typeof decodeInterestTies>;
const paySource = shape({
  id: nonempty,
  publisher: nonempty,
  title: nonempty,
  url,
});
const yearAmount = (v: unknown): [number, number] => {
  const a = array(number)(v);
  if (a.length !== 2) invalid();
  return [count(a[0]), number(a[1])];
};
const categoryAmount = (v: unknown): [string, number] => {
  if (!Array.isArray(v) || v.length !== 2) invalid();
  return [nonempty(v[0]), number(v[1])];
};
const paySpell = (
  v: unknown,
): [string, string | null, string, number, number, number?] => {
  if (!Array.isArray(v) || v.length < 5 || v.length > 6) invalid();
  return [
    date(v[0]),
    nullable(date)(v[1]),
    nonempty(v[2]),
    number(v[3]),
    number(v[4]),
    optional(count)(v[5]),
  ];
};
const nowPay = shape({
  post: nonempty,
  pct: number,
  salary: number,
  since: date,
  assumed: optional(boolean),
});
const payPerson = shape({
  name: nonempty,
  pid: nullable(legacyPersonId),
  party: text,
  chamber: nonempty,
  from: date,
  to: nullable(date),
  sitting: boolean,
  now: nullable(nowPay),
  peak: shape({ post: nonempty, pct: number, salary: number, year: count }),
  total: number,
  spells: (v: unknown) => {
    const a = array(paySpell)(v);
    if (!a.length) invalid();
    return a;
  },
  by_year: (v: unknown) => {
    const a = array(yearAmount)(v);
    if (!a.length) invalid();
    return a;
  },
});
export type PayPerson = Decoded<typeof payPerson>;
export const decodePay = shape({
  meta: shape({
    generated: date,
    as_of: date,
    from: date,
    sources: array(paySource),
    method: nonempty,
    not_covered: array(shape({ id: nonempty, text: nonempty })),
    electorate_allowance: shape({ min: number, max: number, source: nonempty }),
  }),
  base: nonemptyArray(
    shape({
      from: date,
      amount: number,
      source: nonempty,
      url,
    }),
  ),
  offices: dict(
    shape({ label: nonempty, kind: nonempty, pct: number, source: nonempty }),
  ),
  current: array(
    shape({
      id: payId,
      name: nonempty,
      party: text,
      chamber: nonempty,
      post: nonempty,
      pct: number,
      salary: number,
    }),
  ),
  names: records(payId),
  people: dict(payPerson, payId),
});
export type Pay = Decoded<typeof decodePay>;
const expensePerson = shape({
  name: nonempty,
  total: number,
  lines: count,
  from: count,
  to: count,
  by_category: array(categoryAmount),
  by_year: array(yearAmount),
  top: array(
    shape({
      date: nonempty,
      category: nonempty,
      description: text,
      amount: number,
    }),
  ),
});
export type ExpensePerson = Decoded<typeof expensePerson>;
export const decodeExpenses = shape({
  meta: shape({
    generated: date,
    source: nonempty,
    source_url: url,
    licence: nonempty,
    from: matching(/^\d{4}Q0[1-4]$/),
    to: matching(/^\d{4}Q0[1-4]$/),
    quarters: count,
    rows: count,
    unlinked: shape({ names: count, amount: number }),
  }),
  names: records(legacyPersonId),
  people: dict(expensePerson, legacyPersonId),
});
export type Expenses = Decoded<typeof decodeExpenses>;
export const decodeExpenseCategories = shape({
  meta: shape({
    source: nonempty,
    source_url: url,
    licence: nonempty,
    licence_note: nonempty,
    licence_url: url,
    updated: date,
  }),
  groups: array(shape({ id: nonempty, title: nonempty, blurb: text })),
  categories: array(
    shape({
      name: nonempty,
      group: nonempty,
      text: nonempty,
      note: optional(text),
      source: nonempty,
      url: (v: unknown) => (v === '' ? '' : url(v)),
    }),
  ),
});
export type ExpenseCategories = Decoded<typeof decodeExpenseCategories>;
export const decodePhotoPeople = records(portraitKey);
export type PhotoPeople = Decoded<typeof decodePhotoPeople>;
export const decodePhotoCredits = records(
  shape({
    artist: text,
    attribution: text,
    credit: text,
    file: nonempty,
    label: nonempty,
    licence: nonempty,
    licence_url: (v: unknown) => (v === '' ? '' : url(v)),
    page: url,
    wikidata: matching(/^Q\d+$/),
  }),
  matching(/^wd-Q\d+$/),
);
export type PhotoCredits = Decoded<typeof decodePhotoCredits>;
export const decodeMoney = shape({
  meta: shape({
    generated: date,
    source: nonempty,
    coverage: nonempty,
    methodology: nonempty,
    exclusions: strings,
    party_totals_note: nonempty,
  }),
  nodes: array(
    shape({
      id: nonempty,
      label: nonempty,
      kind: nonempty,
      aliases: optional(strings),
      total: number,
      count,
      via: optional(text),
      firstYear: optional(count),
      lastYear: optional(count),
      byYear: dict(yearAmount),
    }),
  ),
  edges: array(
    shape({
      source: nonempty,
      target: nonempty,
      total: number,
      count,
      byYear: dict(yearAmount),
    }),
  ),
});
export type Money = Decoded<typeof decodeMoney>;
export const decodeCorpus = shape({
  version: date,
  expected_resources: count,
  collected_speeches: count,
  sources: array(shape({ name: nonempty, docs: count, coverage: nonempty })),
  inclusion: nonempty,
  known_defects: strings,
  refresh: shape({
    checked_at: date,
    source_limitations: strings,
    resource_counts: dict(count),
    structured_sources: dict(count),
  }),
});
export type Corpus = Decoded<typeof decodeCorpus>;
// /discovery.json (scripts/export_discovery.py; docs/DISCOVERY.md). A signal is
// a lead, never a finding: its title, summary, metric labels, evidence labels
// and caveats are the export's own sentences and stay verbatim. The export's
// timestamps carry microseconds, which not every engine parses, so the
// calendar date is checked on its own.
const exportTimestamp = (v: unknown) => {
  const s = matching(/^\d{4}-\d{2}-\d{2}T/)(v);
  date(s.slice(0, 10));
  return s;
};
const leadMetric = shape({
  label: nonempty,
  value: number,
  format: matching(/^(?:currency|number|percent)$/) as (
    v: unknown,
  ) => 'currency' | 'number' | 'percent',
});
const leadEvidence = shape({
  label: nonempty,
  table: nonempty,
  record_id: nonempty,
  url: nullable(url),
  link_scope: optional(text),
});
const leadParticipant = shape({
  name: nonempty,
  value: number,
  share: number,
  record_count: count,
});
const leadChart = shape({
  type: nonempty,
  group_label: nonempty,
  group_total: number,
  leading_name: nonempty,
  participant_label: nonempty,
  participant_count: count,
  record_count: count,
  participants: nonemptyArray(leadParticipant),
  other_total: number,
  other_share: number,
  other_count: count,
  period: optional(
    shape({
      kind: nonempty,
      from: nullable(text),
      to: nullable(text),
      undated_records: optional(count),
      invalid_date_records: optional(count),
    }),
  ),
});
const discoverySignal = shape({
  id: nonempty,
  category: nonempty,
  entity: nonempty,
  title: nonempty,
  summary: nonempty,
  metrics: array(leadMetric),
  evidence: array(leadEvidence),
  caveats: nonemptyArray(nonempty),
  chart: optional(leadChart),
});
const discoveryEnvelope = shape({
  signals: array((v: unknown) => v),
  coverage: shape({
    donations: count,
    contracts: count,
    snapshot_at: optional(exportTimestamp),
  }),
  methodology: nonemptyArray(nonempty),
  generated_at: exportTimestamp,
});
/**
 * The envelope must be whole; a signal that does not read (no caveats, a
 * metric format the app does not know) is left out and counted, so one odd
 * signal never hides the others and no lead shows without its caveats.
 */
export function decodeDiscovery(value: unknown) {
  const envelope = discoveryEnvelope(value);
  const signals = rows(
    discoverySignal,
    'discovery.signals',
    'counted',
  )(envelope.signals);
  return markPartial(
    {
      ...envelope,
      signals,
      unreadable: envelope.signals.length - signals.length,
    },
    isPartialCatalog(signals),
  );
}
export type Discovery = ReturnType<typeof decodeDiscovery>;
export type DiscoverySignal = Discovery['signals'][number];
export const decodeSearch = shape({
  query: text,
  kind: matching(/^(?:person|interest|pay|expense)$/),
  results: rows(
    shape({
      kind: matching(/^(?:person|interest|pay|expense)$/),
      title: nonempty,
      href: nonempty,
      snippet: text,
      slug: nonempty,
      resource: text,
      source: optional(text),
      url: optional(url),
      personSlug: optional(personSlug),
    }),
  ),
  total: count,
  page: count,
  per_page: count,
  warnings: strings,
  coverage: optional(text),
});
export type SearchPage = Decoded<typeof decodeSearch>;
export type CatalogRecord = SearchPage['results'][number];

// W13, GET /api/app/v1/edition/latest (docs/IOS-API-CONTRACT.md, "App
// readers"; portal/src/app-edition.ts). The Worker writes the envelope and the
// edition field by field, so any other key there is a contract change and is
// refused. Slides are stored verbatim with their type-specific fields, which
// the contract allows: beyond the reader's own checks (type, kicker, title,
// alt; cover first, source last; 3 to 10), only the fields the card reads are
// decoded. Text is plain server copy, never markup.
export const editionKinds = [
  'politician',
  'bill',
  'grant',
  'topic',
  'program',
  'largest',
] as const;
export type EditionKind = (typeof editionKinds)[number];
const slideTypes = [
  'cover',
  'number',
  'picture',
  'bars',
  'ledger',
  'timeline',
  'division',
  'list',
  'source',
] as const;
const oneOf =
  <T extends string>(values: readonly T[]) =>
  (v: unknown): T =>
    values.includes(v as T) ? (v as T) : invalid();
const calendarDay = (v: unknown) => date(matching(/^\d{4}-\d{2}-\d{2}$/)(v));
// The reader's link rule (storedEdition): an https page on the public site
// under a member, bill, grants or report path. The card opens only its path
// and query, on the build's own web origin, through the web link guard.
const editionPage =
  /^\/(?:subject\/person\/|bill\/|money\/grants(?:\/|$)|reports\/)/;
const editionLink = (v: unknown): string => {
  const raw = nonempty(v);
  let link: URL;
  try {
    link = new URL(raw);
  } catch {
    invalid();
  }
  if (
    link.protocol !== 'https:' ||
    link.hostname !== 'opax.com.au' ||
    link.port ||
    link.username ||
    link.password ||
    !editionPage.test(link.pathname)
  )
    invalid();
  return raw;
};
const slideBase = { kicker: text, title: text, alt: text };
const sourceSlide = shape({ ...slideBase, rows: array(text) });
const listSlide = shape({ ...slideBase, note: optional(nullable(text)) });
const otherSlide = shape(slideBase);
// Today's front page reads a few more fields where the slides carry them
// (portal/src/story.ts). Each is optional and lenient: a field that is
// missing or unreadable is left out, and never refuses the edition.
const lenient =
  <T>(decode: Decoder<T>): Decoder<T | undefined> =>
  (v) => {
    try {
      return v === undefined || v === null ? undefined : decode(v);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'invalid-data')
        return undefined;
      throw error;
    }
  };
const coverSlide = shape({ ...slideBase, line: lenient(nonempty) });
const numberSlide = shape({
  ...slideBase,
  value: lenient(nonempty),
  label: lenient(nonempty),
});
const barsSlide = shape({
  ...slideBase,
  items: lenient(
    array(
      shape({
        label: nonempty,
        pct: (v: unknown) =>
          number(v) >= 0 && number(v) <= 100 ? number(v) : invalid(),
      }),
    ),
  ),
  note: lenient(nonempty),
});
const timelineSlide = shape({
  ...slideBase,
  events: lenient(array(shape({ date: nonempty, text: nonempty }))),
});
const divisionSlide = shape({
  ...slideBase,
  ayes: lenient(count),
  noes: lenient(count),
});
export type EditionSlide =
  | ({ type: 'source' } & Decoded<typeof sourceSlide>)
  | ({ type: 'list' } & Decoded<typeof listSlide>)
  | ({ type: 'cover' } & Decoded<typeof coverSlide>)
  | ({ type: 'number' } & Decoded<typeof numberSlide>)
  | ({ type: 'bars' } & Decoded<typeof barsSlide>)
  | ({ type: 'timeline' } & Decoded<typeof timelineSlide>)
  | ({ type: 'division' } & Decoded<typeof divisionSlide>)
  | ({
      type: Exclude<
        (typeof slideTypes)[number],
        | 'source'
        | 'list'
        | 'cover'
        | 'number'
        | 'bars'
        | 'timeline'
        | 'division'
      >;
    } & Decoded<typeof otherSlide>);
const slide = (v: unknown): EditionSlide => {
  const row = object(v);
  const type = oneOf(slideTypes)(row.type);
  if (type === 'source') return { type, ...sourceSlide(row) };
  if (type === 'list') return { type, ...listSlide(row) };
  if (type === 'cover') return { type, ...coverSlide(row) };
  if (type === 'number') return { type, ...numberSlide(row) };
  if (type === 'bars') return { type, ...barsSlide(row) };
  if (type === 'timeline') return { type, ...timelineSlide(row) };
  if (type === 'division') return { type, ...divisionSlide(row) };
  return { type, ...otherSlide(row) };
};
const slides = (v: unknown): EditionSlide[] => {
  const valid = array(slide)(v);
  // Cover, source and minimum length are structural: a journal cannot
  // present a partial slideshow without its opening or attribution.
  if (
    valid.length < 3 ||
    valid.length > 10 ||
    valid[0]!.type !== 'cover' ||
    valid.at(-1)!.type !== 'source'
  )
    invalid();
  return valid;
};
const edition = exact({
  date: calendarDay,
  kind: oneOf(editionKinds),
  subject: nonempty,
  title: nonempty,
  text: nonempty,
  url: editionLink,
  caption: optional(text),
  slides: optional(slides),
});
const envelope = exact({
  schema_version: (v: unknown): 1 => (v === 1 ? 1 : invalid()),
  date: calendarDay,
  // A freeze time, not a source date, and never shown: the reader's own rule.
  created_at: (v: unknown) =>
    Number.isFinite(Date.parse(nonempty(v))) ? text(v) : invalid(),
  edition,
});
export function decodeEdition(v: unknown) {
  const data = envelope(v);
  if (data.edition.date !== data.date) invalid('edition: Not the journal date');
  return data;
}
export type AppEdition = ReturnType<typeof decodeEdition>;
// The latest route's 404s, answered with a body: no posted edition on or
// before the Melbourne date, or (from a Worker without the reader) no route.
const editionAbsent = exact({
  error: (v: unknown): 'edition_not_published' =>
    v === 'edition_not_published' ? v : invalid(),
  date: calendarDay,
});
const routeAbsent = exact({
  error: (v: unknown): 'not_found' => (v === 'not_found' ? v : invalid()),
});
/**
 * A read of the latest route: the edition, or its authoritative absence. The
 * absence is saved like an edition, so it replaces a saved edition rather
 * than letting a relaunch or an offline read bring yesterday's back.
 */
export function decodeEditionRead(
  v: unknown,
): AppEdition | { absent: true; date: string | null } {
  if (v && typeof v === 'object' && 'error' in v) {
    const row = object(v);
    if (row.error === 'not_found') {
      routeAbsent(row);
      return { absent: true, date: null };
    }
    return { absent: true, date: editionAbsent(row).date };
  }
  return decodeEdition(v);
}
export type Edition = AppEdition['edition'];

// Party-page projection of the AEC annual-return export. These receipts are
// the entity's own return, never added to the party's donor-flow total.
export const decodeAecExtras = shape({
  meta: shape({
    generated: date,
    source: nonempty,
    register_url: url,
    licence: nonempty,
    notes: strings,
  }),
  parties: dict(
    shape({
      associated_entities_total: optional(count),
      associated_entities: optional(
        array(
          shape({
            name: nonempty,
            year: nonempty,
            receipts: nullable(number),
            payments: nullable(number),
            debts: nullable(number),
          }),
        ),
      ),
    }),
  ),
});
export type AecExtras = Decoded<typeof decodeAecExtras>;
