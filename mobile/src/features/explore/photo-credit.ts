import type { YearPicture } from './pictures';

/** Print an address credit as its host only. */
export function creditShown(credit: string): string {
  const trimmed = credit.trim();
  const match = /^https?:\/\/([^/?#\s]+)/i.exec(trimmed);
  if (!match) return trimmed;
  return match[1]!
    .replace(/:\d+$/, '')
    .replace(/^www\./i, '')
    .toLowerCase();
}

/** The compact attribution beside Today's photograph, never Commons templates. */
export function archiveAttribution(
  picture: Pick<YearPicture, 'author' | 'credit' | 'licence'>,
): string {
  const credit = picture.credit.trim();
  const address =
    /^(?:[a-z][a-z\d+.-]*:(?=\S)|\/\/|www\.|\S+@)|^\S+\.[a-z]{2,}(?:[/?#]\S*)?$/i;
  const fallback =
    credit.length <= 60 && !address.test(credit) ? creditShown(credit) : '';
  return [picture.author.trim() || fallback, picture.licence.trim()]
    .filter(Boolean)
    .join(' · ');
}
