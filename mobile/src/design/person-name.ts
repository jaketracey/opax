/**
 * A person's name as people write it, at render. Some records give the
 * surname in capitals, as Hansard and old rosters do ("LEO McLEAY",
 * "Anne O'CONNOR", "Kim SMITH-JONES"): those words are drawn in title case
 * ("Leo McLeay", "Anne O'Connor", "Kim Smith-Jones"), keeping Mc and Mac,
 * the letter after an apostrophe and each part of a hyphenated name.
 *
 * Only a name whose surname is entirely capitals is changed, and only its
 * all-capital words. A name already in mixed case is returned as it is, so
 * nothing is guessed about "MacDonald" or "van der Berg". This is for
 * drawing only: the record's own name is what is matched and published.
 */
export function personDisplayName(name: string): string {
  const words = name.trim().split(/\s+/);
  const surname = words.at(-1) ?? '';
  // The surname's letters, less a Mc or Mac that is written in mixed case.
  const letters = surname.replace(/^(Mc|Mac)(?=\p{Lu})/u, '');
  if (
    words.length < 2 ||
    letters.replace(/[^\p{L}]/gu, '').length < 2 ||
    /\p{Ll}/u.test(letters)
  )
    return name;
  return name.replace(
    /(?<![\p{L}])(Mc|Mac)?(\p{Lu})(\p{Lu}+)(?![\p{Ll}])/gu,
    (_word, prefix: string | undefined, first: string, rest: string) =>
      `${prefix ?? ''}${first}${rest.toLowerCase()}`,
  );
}
