// iOS 1.1.3 interest decoder declarations copied verbatim from
// eb6fd2dce:mobile/src/api/catalog-decoders.ts, const tie through InterestTies.
// Only import paths are local adapters; the four holder rules remain nonempty.
import { publicTie } from './donorEntity';
import { interestKey } from './ids';
import { array, count, date, dict, nonempty, nullable, number, optional, records, rows, shape, text, url, type Decoded } from './validation';

const strings = array(text);
const maybeText = optional(nullable(text));
const maybeDate = optional(nullable(date));
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
  // A donor tie names a donor: only organisations (privacy/donorEntity).
  ties: optional((v: unknown) => array(detailTie)(v).filter(publicTie)),
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
  ties: optional((v: unknown) => array(tie)(v).filter(publicTie)),
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
