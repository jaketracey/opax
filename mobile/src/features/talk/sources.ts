import { copy } from '../../design/copy';
import { fromWebPath, electorateRoute } from '../../navigation/routes';
import { webPageUrl } from '../../navigation/external';
import type { VoiceSource } from '../../voice';
import { sourceDate } from '../ask/source-present';

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

/**
 * Ask's pay rows link to `/ask?q=…` (calculated from the determinations, no
 * record page). As in Ask's own source rows, one opens a draft in native Ask
 * with the question filled in, never submitted; it is not a web page Talk
 * opens (navigation/external refuses web Ask).
 */
export function askDraftDestination(path: string) {
  if (!/^\/ask\/?(?:[?#]|$)/.test(path)) return null;
  const native = fromWebPath(path);
  return native?.pathname === '/ask' && native.params.question.trim()
    ? native
    : null;
}

/** A source Talk can open: a validated OPAX page or an Ask draft. */
export const canOpenSource = (path: string) =>
  !!webPageUrl(path) || !!askDraftDestination(path);

/** A voice source; the voice tool sends Ask's labels since im/voice-ask (11 item 5). */
export type DatedSource = Pick<
  VoiceSource,
  'title' | 'path' | 'recordTitle' | 'speaker' | 'type'
> & { date?: string | null };

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
 * A source's meta line: its type and date as Ask writes them ("Speech ·
 * 21 Jun 2001", "Pay record · 1999–2026"), or DIR 4.15's explicit state when
 * the source has none ("Bill · Date not published"). A source never
 * silently drops its date (specs/account.md 7.4, F-8). Without a type (the
 * shipped server) the kind comes from the path.
 */
export function sourceMeta(source: DatedSource): string {
  const kind = source.type?.trim() || sourceKind(source.path);
  return `${kind} · ${sourceDate(source) || copy.dateNotPublished}`;
}

/** The row's title: the plain record title when the tool sent one, else its title. */
export function sourceHeading(source: DatedSource): string {
  return source.recordTitle?.trim() || source.title;
}

/**
 * The speaker or body under the title, as on Ask's rows; none when the
 * title already names them ("Speech by Sam Sample").
 */
export function sourceSpeaker(source: DatedSource): string | null {
  const speaker = source.speaker?.trim();
  if (!speaker) return null;
  return sourceHeading(source)
    .toLocaleLowerCase('en-AU')
    .includes(speaker.toLocaleLowerCase('en-AU'))
    ? null
    : speaker;
}
