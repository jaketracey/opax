import { isOrganisationDonor } from '../../privacy/donorEntity';
/** Donor records stay on the web, behind the donor organisation gate. */
export function quizRecordPath(href: string): string | null {
  const path = href
    .replace(/^#/, '')
    .replace(/^\/search\?/, '/ask?view=search&');
  const donor = /^\/subject\/donor\/([^/?#]+)$/.exec(path);
  if (donor) {
    try {
      if (!isOrganisationDonor({ label: decodeURIComponent(donor[1]!) }))
        return null;
    } catch {
      return null;
    }
  }
  return path;
}
