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
  const starts = new Set<number>();
  const ends = new Set<number>();
  const words: string[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+|&/gu)) {
    const token = match[0];
    const word = token.toLocaleLowerCase('en-AU');
    const value =
      token === token.toLocaleUpperCase('en-AU')
        ? (entityWords.get(word) ?? word)
        : word;
    if (words.length) ranges.push({ start: match.index, end: match.index });
    // An expanded abbreviation is still one source token. A match may use
    // all of its folded words, never just a word inside that expansion.
    starts.add(ranges.length);
    words.push(value);
    for (let i = 0; i < value.length; i++)
      ranges.push({ start: match.index, end: match.index + match[0].length });
    ends.add(ranges.length);
  }
  return { text: words.join(' '), ranges, starts, ends };
}

export function entityMatches(text: string, query: string) {
  const hay = folded(text);
  const needle = folded(query).text;
  const matches: { start: number; end: number }[] = [];
  if (!needle) return matches;
  for (
    let at = hay.text.indexOf(needle);
    at >= 0;
    at = hay.text.indexOf(needle, at + needle.length)
  ) {
    if (!hay.starts.has(at) || !hay.ends.has(at + needle.length)) continue;
    matches.push({
      start: hay.ranges[at]!.start,
      end: hay.ranges[at + needle.length - 1]!.end,
    });
  }
  return matches;
}
