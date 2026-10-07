// Slugs accepted by portal/src/index.ts isPublicSlug. No arbitrary resource IDs.
export const recordSlugPattern =
  /^(?:(?:speech|legal|news)-\d+|division-[a-z0-9-]+|press-(?:pmt|nsw|qld|vic|tre)-[a-z0-9-]+|bill-text-au-federal-[a-z0-9-]{1,180}|grantconnect-award-ga\d+(?:-v\d+)?|grant-site-evidence-(?:ga\d+|mlci-invitation-\d{3})|mlci-invitation-\d{3}|mlci-award-ga[a-z0-9-]+|aec-seat-2025-[a-f0-9]{16}|roster-profile-[a-f0-9]{16}|research-(?:cpi-mlci|mlci-program)-2026)$/;
export const isRecordSlug = (slug: string) => recordSlugPattern.test(slug);
export const billTextPathPattern =
  /^\/bill-texts\/(au-federal-[a-z0-9-]{1,140})\/(index|[rs]\d+-[a-z0-9-]+)\.json$/;

/** The web's related-speech request only: q, kind=speech, per=6, optional topic. */
export function isSimilarRequest(params: URLSearchParams): boolean {
  return (
    !!params.get('q')?.trim() &&
    params.get('q')!.length <= 2000 &&
    params.get('kind') === 'speech' &&
    params.get('per') === '6' &&
    (!params.has('topic') ||
      /^[a-z]+(?:-[a-z]+)*$/.test(params.get('topic')!)) &&
    [...params.keys()].every(
      (key) =>
        ['q', 'kind', 'per', 'topic'].includes(key) &&
        params.getAll(key).length === 1,
    )
  );
}
