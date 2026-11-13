const normalise = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Print an address credit as its host only. When the author is already
 * shown beside the licence, omit a credit that repeats that author.
 */
export function creditShown(credit: string, author?: string): string {
  if (author !== undefined && normalise(credit) === normalise(author))
    return '';
  const trimmed = credit.trim();
  const match = /^https?:\/\/([^/?#\s]+)/i.exec(trimmed);
  if (!match) return trimmed;
  return match[1]!
    .replace(/:\d+$/, '')
    .replace(/^www\./i, '')
    .toLowerCase();
}
