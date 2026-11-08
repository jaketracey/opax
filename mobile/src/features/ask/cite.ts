import { AccessibilityInfo } from 'react-native';
import { catalogs } from '../../api/runtime';
import { webOrigin } from '../../design/environment';
import { haptic } from '../../design/haptics';
import { copyText } from '../records/actions';
import { citationsFor } from '../records/citations';
import type { DocumentRecord } from '../records/model';
import { personName } from './source-present';
import type { Source } from './model';

export type CiteStyle = 'apa' | 'aglc' | 'bibtex' | 'ris';
export const citeStyles: { id: CiteStyle; label: string }[] = [
  { id: 'apa', label: 'APA 7' },
  { id: 'aglc', label: 'AGLC' },
  { id: 'bibtex', label: 'BibTeX' },
  { id: 'ris', label: 'RIS' },
];
/** The record as far as a citation needs it, from what the answer carried. */
export function sourceDocument(s: Source): DocumentRecord {
  return {
    slug: s.slug.replace(/^doc-/, ''),
    title: s.title,
    speaker: s.speaker ? personName(s.speaker) : null,
    url: s.url ?? null,
    labels: { ...(s.state ? { state: s.state } : {}) },
    topics: [],
    metadata: s.date ? { date: s.date } : {},
    summary: null,
    text: '',
  };
}
/**
 * One style's text. Without the corpus version the "via OPAX corpus" clause
 * is left out; "vunversioned" is never produced (journeys/ask.md 4.6 step 4).
 */
export function citeText(
  s: Source,
  style: CiteStyle,
  version: string | null,
  accessed = localDate(),
): string {
  const entries = citationsFor(sourceDocument(s), {
    origin: webOrigin,
    corpusVersion: version ?? '',
    accessed,
  });
  const text = entries.find((entry) => entry.id === style)?.text ?? '';
  if (version) return text;
  return text
    .replace(/Public record, via OPAX corpus v\}/, 'Public record}')
    .replace(/^N1 {2}- Via OPAX corpus v; official record: /m, 'N1  - Official record: ')
    .replace(/^N1 {2}- Via OPAX corpus v\n/m, '');
}
let version: Promise<string | null> | null = null;
/** The corpus version, or null after two seconds or a failure. */
export function corpusVersion(): Promise<string | null> {
  version ??= Promise.race([
    catalogs
      .corpus()
      .then((record) => record.data.version || null)
      .catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
  ]).then((value) => {
    if (!value) version = null;
    return value;
  });
  return version;
}
export async function copyCitation(sources: Source[], style: CiteStyle) {
  const v =
    style === 'bibtex' || style === 'ris' ? await corpusVersion() : null;
  const text = sources
    .map((s) => citeText(s, style, v))
    .filter(Boolean)
    .join(style === 'bibtex' || style === 'ris' ? '\n\n' : '\n');
  if (!text) return;
  if (await copyText(text)) {
    haptic('success');
    const label = citeStyles.find((item) => item.id === style)!.label;
    AccessibilityInfo.announceForAccessibility(
      `${label} ${sources.length > 1 ? 'citations' : 'citation'} copied`,
    );
  }
}
function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
