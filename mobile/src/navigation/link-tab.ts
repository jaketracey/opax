import type { TabSegment } from './chrome';
import { devRoots } from './dev-roots';

/**
 * The tab an incoming link opens in. Every shared-folder route exists in all
 * five tab stacks, so a link without a tab group lets the router pick one
 * (it picked Bills: '< Bills' over a person or a money page). Each link
 * names its tab instead:
 *
 * - a tab's own pages open in that tab (a bill in Bills, a directory in
 *   Search, a conversation in Ask, the members list in Your MP);
 * - the Money map opens in Today on a cold start and in the selected tab on
 *   a warm one (shell spec R12);
 * - everything else, people, parties, seats, editions, money pages and
 *   records, opens in Today.
 */
const tabPages: readonly (readonly [RegExp, TabSegment])[] = [
  [
    /^\/(bills|bill|bill-list|bill-text|bill-text-contents|bill-filters|division-history)(?:\/|$)/,
    '(bills)',
  ],
  [/^\/(search|directory|directory-filters|results)(?:\/|$)/, '(search)'],
  [/^\/(ask|conversations|ask-report|consent)(?:\/|$)/, '(ask)'],
  [/^\/(your-mp|members|election)(?:\/|$)/, '(your-mp)'],
];
const moneyMap =
  /^\/(money|money-record|money-node|money-item|public-money|grants|grant-program|programs|agencies|agency|allocation|connections|largest|leads|lead)(?:\/|$)/;
// Root-stack routes: never inside a tab.
const outsideTabs =
  /^\/(account|community|talk|licence|licences|citation|machine-note|rule|seat|source|source-destination|term|term-tip|welcome)(?:\/|$)/;
const tabSegments = new Set<string>([
  '(today)',
  '(your-mp)',
  '(bills)',
  '(search)',
  '(ask)',
]);

let selected: TabSegment | null = null;

/** Called by the tab layout whenever the selected tab changes. */
export function setSelectedTab(segment: string | undefined) {
  if (segment && tabSegments.has(segment)) selected = segment as TabSegment;
}
export function selectedTab(): TabSegment | null {
  return selected;
}

/**
 * The tab group for a resolved app pathname ('/person/anthony-albanese'),
 * or null when the path is outside the tabs or already names its group.
 */
export function linkTab(pathname: string, initial: boolean): TabSegment | null {
  if (pathname.startsWith('/(') || outsideTabs.test(pathname)) return null;
  if (
    devRoots.some(
      (root) => pathname === `/${root}` || pathname.startsWith(`/${root}/`),
    )
  )
    return null;
  for (const [pattern, tab] of tabPages) if (pattern.test(pathname)) return tab;
  if (
    (moneyMap.test(pathname) || /^\/vic-election(?:\/|$)/.test(pathname)) &&
    !initial &&
    selected
  )
    return selected;
  return '(today)';
}

/** The pathname inside its tab group: '/(tabs)/(today)/person/x'. */
export function inLinkTab(pathname: string, initial: boolean): string {
  const tab = linkTab(pathname, initial);
  if (!tab) return pathname;
  return `/(tabs)/${tab}${pathname === '/' ? '' : pathname}`;
}
