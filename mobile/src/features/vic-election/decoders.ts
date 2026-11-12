import {
  array,
  boolean,
  count,
  date,
  invalid,
  matching,
  nonempty,
  nullable,
  number,
  object,
  shape,
  text,
  type Decoded,
} from '../../api/validation';

const literal =
  <T extends string | number>(...values: T[]) =>
  (v: unknown): T =>
    values.includes(v as T) ? (v as T) : invalid();
const version = literal(1);
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slug = matching(slugPattern);
const path = matching(/^\/(?!\/)[^\s?#]*$/);
const https = (v: unknown) => {
  const s = nonempty(v);
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password) invalid();
  } catch {
    invalid();
  }
  return s;
};
const day = (v: unknown) => {
  const s = date(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : invalid();
};
const instant = (v: unknown) => {
  const s = nonempty(v);
  return /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s))
    ? s
    : invalid();
};
const percent = (v: unknown) => {
  const n = number(v);
  return n >= 0 && n <= 100 ? n : invalid();
};
const link = shape({ label: nonempty, url: https });
const named = { name: nonempty, party: nullable(nonempty) };
const contestFields = {
  date: day,
  kind: literal('general', 'by-election', 'supplementary'),
  party: nonempty,
  margin: percent,
};
const contestRow = shape(contestFields);
const contest = shape({
  ...contestFields,
  share: percent,
  against: nonempty,
  against_share: percent,
  url: https,
});
export const decodeDistrictRow = shape({
  kind: literal('district'),
  slug,
  name: nonempty,
  region: nonempty,
  electorate_url: path,
  member: shape(named),
  result: nullable(contestRow),
  candidates: count,
});
export const decodeRegionRow = shape({
  kind: literal('region'),
  slug,
  name: nonempty,
  electorate_url: path,
  members: array(shape(named)),
  districts: count,
  candidates: count,
});
const keyDate = shape({
  id: literal(
    'enrolment',
    'caretaker',
    'nominations',
    'postal',
    'early',
    'election_day',
  ),
  label: nonempty,
  when: nonempty,
  passes_at: nullable(instant),
  passed_label: nullable(nonempty),
  passed_when: nullable(nonempty),
  link: nullable(link),
});
const notice = (v: unknown) =>
  v == null
    ? null
    : shape({
        text: (s) => {
          const t = nonempty(s);
          return t.length <= 200 ? t : invalid();
        },
        link: nullable(link),
      })(v);
export const decodeOverview = shape({
  schema_version: version,
  title: nonempty,
  web_url: https,
  updated: day,
  election_day: day,
  polls_open: instant,
  polls_close: instant,
  term_start: day,
  term_end: day,
  key_dates: array(keyDate),
  notice,
  candidates_published: nullable(day),
  results_fetched: day,
  roster_date: day,
  districts: array(decodeDistrictRow),
  regions: array(decodeRegionRow),
  sources: shape({
    election: https,
    voting: https,
    enrolment: https,
    address: https,
    results: https,
    licence: https,
  }),
  about: nonempty,
  methods_url: https,
  authorisation: nonempty,
  corrections: shape({
    email: matching(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    response: nonempty,
  }),
});
const memberRef = { ...named, slug, href: path };
const member = shape({
  ...memberRef,
  source_url: https,
  speeches: nullable(
    shape({ count, first: count, last: count, within_term: boolean }),
  ),
  speech_gap: nullable(nonempty),
  votes: nullable(shape({ count, ayes: count, noes: count })),
  recent_votes: (v) => {
    const votes = array(
      shape({
        date: day,
        title: nonempty,
        href: path,
        vote: nonempty,
        source_url: https,
      }),
    )(v);
    return votes.length <= 3 ? votes : invalid();
  },
});
const seat = shape({
  schema_version: version,
  updated: day,
  kind: literal('district', 'region'),
  slug,
  name: nonempty,
  web_url: https,
  source_url: https,
  electorate_url: path,
  roster_date: day,
  formerly: nullable(nonempty),
  created: boolean,
  boundary_note: nullable(nonempty),
  region: nullable(
    shape({ slug, name: nonempty, members: array(shape(memberRef)) }),
  ),
  districts: array(decodeDistrictRow),
  result: nullable(shape({ general: contest, since: nullable(contest) })),
  candidates: nullable(
    shape({ published: day, url: https, list: array(shape(named)) }),
  ),
  members: array(member),
  results_fetched: day,
  speech_updated: day,
  division_start: nullable(day),
  division_end: day,
});
export const decodeSeat = (v: unknown) => {
  const s = seat(v);
  if (!s.members.length || (s.kind === 'region' && s.result !== null))
    invalid();
  return s;
};
const findSeat = (v: unknown) => {
  const o = object(v);
  return {
    ...(o.kind === 'district' ? decodeDistrictRow(v) : decodeRegionRow(v)),
    share: nullable(percent)(o.share),
  };
};
export const decodeFind = shape({
  schema_version: version,
  q: nonempty,
  places_searched: boolean,
  hits: (v) => {
    const hits = array(
      shape({
        name: nonempty,
        kind: literal(
          'District',
          'Region',
          'Member',
          'Suburb',
          'Postcode',
          'Council area',
        ),
        seats: array(findSeat),
      }),
    )(v);
    return hits.length <= 8 ? hits : invalid();
  },
  split: boolean,
  empty: nullable(literal('postcode', 'place')),
  address_url: https,
  attribution: text,
  note: text,
});
export type Overview = Decoded<typeof decodeOverview>;
export type SeatDetail = Decoded<typeof decodeSeat>;
export type District = Decoded<typeof decodeDistrictRow>;
export type Region = Decoded<typeof decodeRegionRow>;
export type FindResponse = Decoded<typeof decodeFind>;
export type KeyDate = Overview['key_dates'][number];
export type Contest = NonNullable<SeatDetail['result']>['general'];
export type Member = SeatDetail['members'][number];
