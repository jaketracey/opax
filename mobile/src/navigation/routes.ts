export const personRoute = (slug: string) => ({
  pathname: '/person/[slug]' as const,
  params: { slug },
});
// Alignment only. Associated Domains and native universal-link handling belong to a later lane.
export function fromWebPath(
  path: string,
): ReturnType<typeof personRoute> | null {
  const match = /^\/subject\/person\/([a-z0-9-]+)\/?$/.exec(path);
  return match?.[1] ? personRoute(match[1]) : null;
}
// Reserved Talk sheet presentation seam; no permission or transport is installed.
export const voiceSlot = { enabled: false, module: 'src/voice' } as const;
