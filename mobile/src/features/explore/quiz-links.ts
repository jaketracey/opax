import { isOrganisation } from '../money-public/privacy';
/** Donor records stay on the web, with the same conservative organisation gate. */
export function quizRecordPath(href: string): string | null {
  const path = href
    .replace(/^#/, '')
    .replace(/^\/search\?/, '/ask?view=search&');
  const donor = /^\/subject\/donor\/([^/?#]+)$/.exec(path);
  if (donor) {
    try {
      if (!isOrganisation(decodeURIComponent(donor[1]!))) return null;
    } catch {
      return null;
    }
  }
  return path;
}
