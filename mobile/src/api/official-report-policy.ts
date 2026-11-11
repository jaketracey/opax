// The public schema-1 projection reads one static asset, with no model call.
export const reportSlugPattern =
  /^(?:royal-commission|integrity-report|annual-report|agency-report)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isReportSlug = (slug: string) =>
  slug.length <= 260 && reportSlugPattern.test(slug);
export function isOfficialReportPath(path: string) {
  const page =
    /^\/api\/report\/([^/?#]+)\/transcripts\?offset=(0|[1-9]\d{0,8})$/.exec(
      path,
    );
  if (page)
    return isReportSlug(page[1]!) && Number.isSafeInteger(Number(page[2]));
  const match = /^\/api\/report\/([^/?#]+)$/.exec(path);
  return !!match?.[1] && isReportSlug(match[1]);
}
