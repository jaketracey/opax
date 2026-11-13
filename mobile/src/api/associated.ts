/**
 * The AEC associated-entity line a money export puts on a donor
 * (`associatedTag`, `associatedWith`), mirroring the website's
 * donor-disclosure.js. Both fields are optional: a donor the register does not
 * tie to a party it gives to has neither, and then nothing here returns text.
 * The tag is shown verbatim and the same way for every party.
 */
export interface AssociatedFields {
  associatedTag?: unknown;
  associatedWith?: unknown;
}
export const AEC_ASSOCIATED_REGISTER =
  'https://transparency.aec.gov.au/RegisterOfEntities?clientType=associatedentity';
const safeHttps = (value: unknown): string | null =>
  typeof value === 'string' && /^https:\/\//i.test(value) ? value : null;
const links = (record: AssociatedFields | null | undefined) =>
  Array.isArray(record?.associatedWith)
    ? (record.associatedWith as { party?: unknown; url?: unknown }[]).filter(
        (a) => a && typeof a === 'object',
      )
    : [];
/** Lenient: a malformed optional field is dropped, never a reason to refuse the graph. */
export const decodeAssociatedTag = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;
export const decodeAssociatedWith = (
  v: unknown,
): { party: string; url?: string }[] | undefined => {
  const rows = links({ associatedWith: v }).flatMap((a) =>
    typeof a.party === 'string' && a.party
      ? [
          {
            party: a.party,
            ...(safeHttps(a.url) ? { url: a.url as string } : {}),
          },
        ]
      : [],
  );
  return rows.length ? rows : undefined;
};
export const sentenceCase = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
/** The register line wherever the donor's name is shown, or null. */
export function donorAssociated(
  record: AssociatedFields | null | undefined,
): { tag: string; url: string } | null {
  const tag = decodeAssociatedTag(record?.associatedTag);
  if (!tag) return null;
  return {
    tag,
    url: safeHttps(links(record)[0]?.url) ?? AEC_ASSOCIATED_REGISTER,
  };
}
/**
 * The register line for a row about receipts to one party: only when the
 * register ties the donor to that party, so a tag never rides on the donor's
 * receipts to a different party. `party` is the party node's label.
 */
export function donorAssociatedTo(
  record: AssociatedFields | null | undefined,
  party: string,
): { tag: string; url: string } | null {
  return links(record).some((a) => a.party === party)
    ? donorAssociated(record)
    : null;
}
/** Sentence-cased tag for a line of its own, or null. */
export const associatedLine = (found: { tag: string } | null): string | null =>
  found ? sentenceCase(found.tag) : null;
