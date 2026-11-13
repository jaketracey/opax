/** Fixed route-file patterns, never pathnames or parameter values.
 * The regression test compares this list with src/app when routes change.
 */
const routePatterns = new Set([
  '/',
  '/account',
  '/account/about',
  '/account/ask',
  '/account/consent',
  '/account/conversations',
  '/account/coverage',
  '/account/delete',
  '/account/delete/code',
  '/account/methods',
  '/account/sign-in',
  '/account/sign-in/code',
  '/account/sources',
  '/account/sources/dataset/[id]',
  '/account/sources/datasets',
  '/account/sources/fonts',
  '/account/sources/photos',
  '/account/sources/portraits',
  '/account/stats',
  '/agencies',
  '/agency',
  '/agency-list',
  '/ask',
  '/ask-report',
  '/bill-list',
  '/bill-text-contents/[key]',
  '/bill-text/[key]',
  '/bill/[key]',
  '/bills',
  '/citation',
  '/community/[view]',
  '/connection',
  '/connections',
  '/consent',
  '/conversations',
  '/declarations',
  '/directory',
  '/discover',
  '/division-history',
  '/doc-cite/[slug]',
  '/doc/[slug]',
  '/report/[slug]',
  '/edition',
  '/election',
  '/electorate-date',
  '/electorate/[id]',
  '/expense-glossary',
  '/explore',
  '/explore/[tool]',
  '/explore/photo',
  '/explore/tide-table',
  '/explore/years',
  '/filters/[list]',
  '/filters/[list]/[facet]',
  '/follows',
  '/funding-by-seat-type',
  '/grant-program',
  '/grants',
  '/grants-allocation',
  '/largest-grants',
  '/lead/[id]',
  '/leads',
  '/licence/[id]',
  '/licence/sources',
  '/licence/sources/[...path]',
  '/licences',
  '/machine-note',
  '/members',
  '/methods',
  '/money',
  '/money-donors',
  '/money-item',
  '/money-node',
  '/money-record',
  '/other',
  '/party-sources',
  '/party/[slug]',
  '/person/[slug]',
  '/person/[slug]/interests',
  '/person/[slug]/speeches',
  '/person/[slug]/votes',
  '/public-money',
  '/recent-records',
  '/record-list',
  '/results/[kind]',
  '/rule',
  '/search',
  '/seat',
  '/seat/state/[code]',
  '/source',
  '/stats',
  '/talk',
  '/talk/consent',
  '/talk/record',
  '/talk/sign-in',
  '/talk/sign-in/code',
  '/talk/sources',
  '/topic/[slug]',
  '/topics',
  '/welcome',
  '/welcome/seat',
  '/welcome/seat/state/[code]',
  '/vic-election',
  '/vic-election/[district]',
  '/your-mp',
]);

/**
 * The sections a screen can be in, for `from_section`: each pattern's first
 * segment ("person" for "/person/[slug]"), "today" for the home screen and
 * "other". A parameter is never a section.
 */
export const routeSections: ReadonlySet<string> = new Set([
  'today',
  'other',
  ...[...routePatterns]
    .map((pattern) => pattern.split('/')[1] ?? '')
    .filter((first) => /^[a-z][a-z0-9-]{0,31}$/.test(first)),
]);

export function routeErrorPattern(value: unknown): string | undefined {
  return typeof value === 'string' && routePatterns.has(value)
    ? value
    : undefined;
}

const compiled = [...routePatterns].map((pattern) => ({
  pattern,
  parts: pattern === '/' ? [] : pattern.slice(1).split('/'),
}));
const parameter = /^\[[A-Za-z]{1,24}\]$/;
const rest = /^\[\.\.\.[A-Za-z]{1,24}\]$/;

/**
 * The fixed pattern a concrete app path lands on: "/person/[slug]" for
 * "/(tabs)/(today)/person/jane-citizen?from=widget", else "/other". Groups,
 * "index", the query and the fragment are dropped, and a literal segment
 * beats a parameter. Only a pattern from the list above is ever returned,
 * never a segment of the path.
 */
export function routePatternFor(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? '';
  const segments = pathname
    .split('/')
    .filter((s) => s && s !== 'index' && !/^\(.*\)$/.test(s));
  let best: { pattern: string; literal: number } | null = null;
  for (const { pattern, parts } of compiled) {
    const open = parts.length > 0 && rest.test(parts[parts.length - 1]!);
    if (
      open ? segments.length < parts.length : segments.length !== parts.length
    )
      continue;
    let literal = 0;
    const matches = parts.every((part, i) => {
      if (rest.test(part) || parameter.test(part)) return true;
      if (part !== segments[i]) return false;
      literal += 1;
      return true;
    });
    if (matches && (!best || literal > best.literal))
      best = { pattern, literal };
  }
  return best?.pattern ?? '/other';
}
