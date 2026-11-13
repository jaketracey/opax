import { decodeEntities } from '../../api/passage-text';
import {
  cleanRecordTitle,
  formatDate,
  recordTitleStage,
} from '../../design/format';
import { canonicalUrl } from '../../navigation/external';
import { titleSubject } from '../records/citations';
import { parliaments, sourceGroups, type Source } from './model';

/**
 * One title and one meta line for every Ask source (specs/ask.md 6.3):
 * Records cited, the source sheet, the iPad pane, `/citation`, the share
 * payload and the report. Never the Worker's raw title (no em dashes, no ISO
 * dates, no roster-form names) and never "Federal".
 */
export function personName(raw: string | null | undefined): string {
  const name = decodeEntities(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  // "WILKIE, Andrew, MP" and "Wilkie, Andrew" become "Andrew Wilkie".
  const roster =
    /^([^,]+),\s*([^,]+?)(?:,\s*(?:MP|Senator|MLA|MLC|MHR))?$/i.exec(name);
  const ordered = roster ? `${roster[2]} ${roster[1]}` : name;
  return ordered
    .split(' ')
    .map((part) =>
      part.length > 1 && part === part.toUpperCase() && /[A-Z]/.test(part)
        ? part
            .toLowerCase()
            .replace(
              /(^|[-'’])(\p{L})/gu,
              (_m, sep: string, ch: string) => sep + ch.toUpperCase(),
            )
            .replace(/^Mc(\p{L})/u, (_m, ch: string) => `Mc${ch.toUpperCase()}`)
        : part,
    )
    .join(' ');
}
export function sourceKind(s: Source): string {
  const path = s.href || '';
  if (path.startsWith('/bill/') || s.slug.startsWith('bill-')) return 'Bill';
  if (path.startsWith('/subject/person/')) return 'Person';
  if (/determination|tribunal/i.test(`${s.source ?? ''} ${s.title}`))
    return 'Determination';
  if (/annual return|disclosure|\baec\b/i.test(`${s.source ?? ''}`))
    return 'Annual return';
  if (/press|media release/i.test(`${s.source ?? ''}`)) return 'Press release';
  return s.speaker ? 'Speech' : 'Record';
}
export function sourceTitle(s: Source): string {
  // Titles stay raw in saved answers; decode only for presentation.
  const title = decodeEntities(s.title);
  const subject = titleSubject({
    title,
    speaker: s.speaker ? personName(s.speaker) : null,
    date: s.date ?? null,
  });
  // A speech title that begins with the speaker's roster name drops it too.
  const raw = s.speaker
    ? subject
        .replace(
          new RegExp(
            `^${decodeEntities(s.speaker).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[\u2014–-]\\s*`,
          ),
          '',
        )
        .trim()
    : subject;
  return cleanRecordTitle(raw || title) || s.slug || 'Record';
}
/** The stage the stored title carried, folded into the meta line. */
export function sourceStage(s: Source): string | null {
  return recordTitleStage(decodeEntities(s.title));
}
/** "Speech · Second reading · Victoria · 18 Aug 2026"; never "Federal". */
export function sourceMeta(s: Source): string {
  const date = sourceDate(s);
  return [
    sourceKind(s),
    sourceStage(s),
    s.state && s.state !== 'federal' ? (parliaments[s.state] ?? null) : null,
    date,
  ]
    .filter(Boolean)
    .join(' · ');
}
/** "18 Aug 2026", a year, a financial year, or null when none was published. Talk's sources share it. */
export function sourceDate(s: { date?: string | null }): string | null {
  const date = s.date?.trim();
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(date))
    return formatDate(date.slice(0, 10), 'short');
  return date.replace(/^(\d{4})-(\d{2})$/, '$1–$2');
}
/** The record's OPAX link, for the share payload and reports. */
export function sourceLink(s: Source): string {
  const path = s.href || (s.slug ? `/doc/${s.slug}` : '');
  try {
    return path.startsWith('/') ? canonicalUrl(path) : s.url || path;
  } catch {
    return path;
  }
}
/** The cited sources in citation order (numbered 1…), else every source found. */
export function citedSources(sources: Source[]) {
  const groups = sourceGroups(sources);
  const numbered = groups.cited.some((source) => source.cited);
  return { ...groups, numbered };
}
