import {
  array,
  boolean,
  count,
  date,
  dict,
  invalid,
  matching,
  nonempty,
  nonemptyArray,
  nullable,
  number,
  object,
  optional,
  shape,
  text,
  url,
  type Decoded,
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
  people: array(rosterPerson),
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
  people: array(electoratePerson),
});
export function decodePeople(v: unknown) {
  const p = peopleShape(v);
  if (new Set(p.people.map((p) => p.person_id)).size !== p.people.length)
    invalid('Duplicate canonical people.');
  return p;
}
export type PeopleCatalog = Decoded<typeof decodePeople>;
export const decodeSlugs = shape({
  generated: date,
  slugs: dict(nonempty, personSlug),
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
};
const electorate = shape(electorateFields);
export type Electorate = Decoded<typeof electorate>;
const indexShape = shape({ meta: releaseMeta, electorates: array(electorate) });
export function decodeElectorateIndex(v: unknown) {
  const index = indexShape(v);
  if (
    new Set(index.electorates.map((s) => s.electorate_id)).size !==
    index.electorates.length
  )
    invalid('Duplicate electorates.');
  for (const s of index.electorates)
    if (
      s.detail_url !==
        `/electorates/releases/${index.meta.release_id}/${s.electorate_id}.json` ||
      s.representatives.some((r) => r.person_id !== r.person.person_id)
    )
      invalid('The seat IDs do not match their release.');
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
  const s = electorateShape(v);
  if (
    s.representatives.some((r) => r.person_id !== r.person.person_id) ||
    Object.entries(s.people).some(([id, p]) => id !== p.person_id)
  )
    invalid('The seat person IDs do not agree.');
  return s;
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
  bills: array(bill),
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
  const records: Record<string, VoteRecord> = {};
  for (const [k, row] of Object.entries(raw)) {
    if (k === '_names' || k === '_meta') continue;
    records[voteKey(k)] = vote(row);
  }
  const names = dict(array(voteKey))(raw._names);
  if (
    Object.values(names).some((keys) =>
      keys.some((k) => !Object.hasOwn(records, k)),
    )
  )
    invalid('The voting name index points to a missing record.');
  const meta = raw._meta === undefined ? null : votesMeta(raw._meta);
  if (meta && meta.schema !== 1) invalid('The voting schema is unsupported.');
  return { records, names, meta };
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
  _by_name: dict(interestKey),
  people: dict(shape({ name: nonempty, total: count }), interestKey),
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
  items: array(recentDeclaration),
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
  donors: dict(array(donorTie)),
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
  names: dict(payId),
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
  names: dict(legacyPersonId),
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
export const decodePhotoPeople = dict(portraitKey);
export type PhotoPeople = Decoded<typeof decodePhotoPeople>;
export const decodePhotoCredits = dict(
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
export const decodeSearch = shape({
  query: text,
  kind: matching(/^(?:person|interest|pay|expense)$/),
  results: array(
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
