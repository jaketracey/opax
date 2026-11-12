import { copy } from '../../design/copy';
import { formatDate } from '../../design/format';
import { fromWebPath, electorateRoute } from '../../navigation/routes';
import { webPageUrl } from '../../navigation/external';

export function recordDestination(path: string) {
  // Recheck at the navigation boundary, including queries and fragments.
  if (!webPageUrl(path)) return null;
  const native = fromWebPath(path);
  if (
    native &&
    (native.pathname === '/person/[slug]' ||
      native.pathname === '/bill/[key]' ||
      native.pathname === '/electorate/[id]' ||
      native.pathname === '/doc/[slug]' ||
      native.pathname === '/report/[slug]' ||
      native.pathname === '/bill-text/[key]')
  )
    return native;
  const electorate = /^\/subject\/electorate\/([a-z0-9-]+)\/?$/.exec(path);
  return electorate?.[1] ? electorateRoute(electorate[1]) : null;
}

/** A voice source; the voice tool adds a date once it sends one (11 item 5). */
export type DatedSource = { title: string; path: string; date?: string | null };

const kinds: [RegExp, string][] = [
  [/^\/report\//, 'Report'],
  [/^\/bill-text\//, 'Bill text'],
  [/^\/bills?\//, 'Bill'],
  [/^\/(?:subject\/)?person\//, 'Parliamentarian'],
  [/^\/(?:subject\/)?electorate\//, 'Electorate'],
  [/^\/divisions?\//, 'Division'],
  [/^\/speech(?:es)?\//, 'Speech'],
  [/^\/party\//, 'Party'],
];
/** What kind of record a source path names ("Bill", "Division"). */
export function sourceKind(path: string): string {
  return kinds.find(([pattern]) => pattern.test(path))?.[1] ?? 'Record';
}

/**
 * A source's meta line: its kind and date, or DIR 4.15's explicit state
 * when the source has none ("Bill · Date not published"). A source never
 * silently drops its date (specs/account.md 7.4, F-8).
 */
export function sourceMeta(source: DatedSource): string {
  const date = source.date ? formatDate(source.date, 'short') : null;
  return `${sourceKind(source.path)} · ${date || copy.dateNotPublished}`;
}
