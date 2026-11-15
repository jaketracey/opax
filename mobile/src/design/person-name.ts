/**
 * A person's name as people write it, at render. Some records give the
 * surname in capitals, as Hansard and old rosters do ("LEO McLEAY",
 * "Anne O'CONNOR", "Kim SMITH-JONES"): those words are drawn in title case
 * ("Leo McLeay", "Anne O'Connor", "Kim Smith-Jones"), keeping Mc and Mac,
 * the letter after an apostrophe and each part of a hyphenated name.
 *
 * Only a name whose surname is entirely capitals is changed, and only its
 * all-capital words. A name already in mixed case is returned as it is, so
 * nothing is guessed about "MacDonald" or "van der Berg". Given-name
 * initials of one or two letters ("AJ SMITH") and post-nominals after the
 * surname ("Leo McLEAY AO") stay in capitals. This is for drawing only: the
 * record's own name is what is matched and published.
 */
const POST_NOMINALS = new Set('AO AC AM OAM MP QC KC SC PSM CSC'.split(' '));
const lettersOf = (word: string) => word.replace(/[^\p{L}]/gu, '');

export function personDisplayName(name: string): string {
  // Words and the spaces between them, so the name is rebuilt as written.
  const parts = name.split(/(\s+)/);
  const words = parts.filter((part) => /\S/.test(part));
  // The surname is the last word before any post-nominals.
  let count = words.length;
  while (count > 1 && POST_NOMINALS.has(lettersOf(words[count - 1]!))) count--;
  const surname = words[count - 1] ?? '';
  // The surname's letters, less a Mc or Mac that is written in mixed case.
  const letters = surname.replace(/^(Mc|Mac)(?=\p{Lu})/u, '');
  if (count < 2 || lettersOf(letters).length < 2 || /\p{Ll}/u.test(letters))
    return name;
  let seen = 0;
  return parts
    .map((part) => {
      if (!/\S/.test(part)) return part;
      const index = seen++;
      // Post-nominals, and a given name's initials, stay as they are.
      if (index >= count) return part;
      if (index < count - 1 && lettersOf(part).length <= 2) return part;
      return part.replace(
        /(?<![\p{L}])(Mc|Mac)?(\p{Lu})(\p{Lu}+)(?![\p{Ll}])/gu,
        (_word, prefix: string | undefined, first: string, rest: string) =>
          `${prefix ?? ''}${first}${rest.toLowerCase()}`,
      );
    })
    .join('');
}
