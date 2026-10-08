import { matching, type Decoder } from './validation';

declare const identity: unique symbol;
type ID<K extends string> = string & { readonly [identity]: K };
export type PersonId = ID<'canonical-person'>;
export type LegacyPersonId = ID<'legacy-numeric-person'>;
// State exports also carry IDs such as vic_enver_erdogan. They are not TVFY IDs.
export type RosterId = ID<'roster-person'>;
export type NameKey = ID<'folded-name'>;
export type PersonSlug = ID<'person-slug'>;
export type BillKey = ID<'bill-key'>;
export type ElectorateId = ID<'electorate'>;
export type InterestKey = ID<'interest-key'>;
export type PayId = ID<'parliamentary-handbook'>;
export type VoteKey = ID<'vote-key'>;
export type PortraitKey = ID<'portrait-key'>;
const branded =
  <K extends string>(pattern: RegExp): Decoder<ID<K>> =>
  (v) =>
    matching(pattern)(v) as ID<K>;
export const personId = branded<'canonical-person'>(/^person_[a-f0-9]{24}$/);
export const legacyPersonId = branded<'legacy-numeric-person'>(/^\d+$/);
export const rosterId = branded<'roster-person'>(
  /^(?:\d+|(?:nsw|vic|qld|sa|wa|tas|act|nt|wragge|zenodo|aph)_[a-z0-9_]+)$/,
);
export const personSlug = branded<'person-slug'>(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const billKey = branded<'bill-key'>(
  /^au-federal-(?:[rs]\d+|alrc-\d+|ed-[a-z0-9]+(?:-[a-z0-9]+)*)$/,
);
export const electorateId = branded<'electorate'>(/^el_[a-f0-9]{24}$/);
// Register keys: an OpenAustralia person id, an APH roster id for members
// that id does not cover yet ("aph_25813"), or a name slug ("n-jessica-pugh").
export const interestKey = branded<'interest-key'>(
  /^(?:\d+|aph_\d+|n-[a-z0-9]+(?:-[a-z0-9]+)*)$/,
);
export const payId = branded<'parliamentary-handbook'>(/^[A-Za-z0-9]+$/);
export const voteKey = branded<'vote-key'>(
  /^(?:\d+|(?:nsw|vic|qld|sa|wa|tas|act|nt):[a-z0-9]+(?:-[a-z0-9]+)*)$/,
);
export const portraitKey = branded<'portrait-key'>(/^(?:\d+|wd-Q\d+)$/);
export function nameKey(name: string): NameKey {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’‘ʼ`.]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim() as NameKey;
}
// Apply the same folding to both the query and source keys. Decoders retain
// source spellings; several spellings may legitimately index the same ID.
// Decoded catalog objects are immutable snapshots. Keep source order and every
// ambiguous spelling, so indexing does not weaken identity checks.
const foldedIndexes = new WeakMap<
  object,
  Map<NameKey, { order: number; value: unknown }[]>
>();
export function nameValues<T>(index: Record<string, T>, names: string[]): T[] {
  let folded = foldedIndexes.get(index);
  if (!folded) {
    folded = new Map();
    Object.entries(index).forEach(([key, value], order) => {
      const name = nameKey(key);
      const rows = folded!.get(name) ?? [];
      rows.push({ order, value });
      folded!.set(name, rows);
    });
    foldedIndexes.set(index, folded);
  }
  return [...new Set(names.map(nameKey))]
    .flatMap((key) => folded!.get(key) ?? [])
    .sort((a, b) => a.order - b.order)
    .map((row) => row.value as T);
}
