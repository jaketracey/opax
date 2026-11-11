// The public schema-1 projection reads one static asset, with no model call.
export const reportSlugPattern =
  /^(?:royal-commission|integrity-report|annual-report|agency-report)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isReportSlug = (slug: string) =>
  slug.length <= 260 && reportSlugPattern.test(slug);
export function isOfficialReportPath(path: string) {
  const match = /^\/api\/report\/([^/?#]+)$/.exec(path);
  return !!match?.[1] && isReportSlug(match[1]);
}
