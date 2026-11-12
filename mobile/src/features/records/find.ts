/** Entity spellings fold without changing the record or its highlight offsets. */
const entityWords = new Map([
  ['&', 'and'],
  ['nsw', 'new south wales'],
  ['vic', 'victoria'],
  ['qld', 'queensland'],
  ['wa', 'western australia'],
  ['sa', 'south australia'],
  ['tas', 'tasmania'],
  ['act', 'australian capital territory'],
  ['nt', 'northern territory'],
]);

function folded(text: string) {
  const ranges: { start: number; end: number }[] = [];
  const words: string[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+|&/gu)) {
    const word = match[0].toLocaleLowerCase('en-AU');
    const value = entityWords.get(word) ?? word;
    if (words.length) ranges.push({ start: match.index, end: match.index });
    words.push(value);
    for (let i = 0; i < value.length; i++)
      ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return { text: words.join(' '), ranges };
}

export function entityMatches(text: string, queries: readonly string[]) {
  const hay = folded(text);
  const matches: { start: number; end: number }[] = [];
  for (const query of queries) {
    const needle = folded(query).text;
    if (!needle) continue;
    for (
      let at = hay.text.indexOf(needle);
      at >= 0;
      at = hay.text.indexOf(needle, at + needle.length)
    ) {
      // Entity names are whole words, so an alias cannot match inside another name.
      if (
        (at && hay.text[at - 1] !== ' ') ||
        (at + needle.length < hay.text.length &&
          hay.text[at + needle.length] !== ' ')
      )
        continue;
      matches.push({
        start: hay.ranges[at]!.start,
        end: hay.ranges[at + needle.length - 1]!.end,
      });
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const unique: typeof matches = [];
  for (const match of matches)
    if (!unique.length || match.start >= unique[unique.length - 1]!.end)
      unique.push(match);
  return unique;
}

/** Route aliases are optional, bounded data, never a pattern to execute. */
export function findAliases(value: unknown): string[] {
  try {
    const aliases: unknown =
      typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(aliases)
      ? aliases
          .filter(
            (alias): alias is string =>
              typeof alias === 'string' &&
              !!alias.trim() &&
              alias.length <= 200,
          )
          .slice(0, 16)
      : [];
  } catch {
    return [];
  }
}
