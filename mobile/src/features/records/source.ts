// Who holds a record the reader shows, for its source line (records.md 2.6):
// the original's publisher, its licence where Sources and licences verifies
// one, and the notes on the text, in plain words.
import type { SourceCitation, SourceOriginal } from '../../design/primitives';
import { formatDate } from '../../design/format';
import { recordDate, recordKind, type DocumentRecord } from './model';

const host = (url: string | null) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

export interface RecordSource {
  citation: SourceCitation;
  licence?: string;
  /** A `datasets.ts` id on Sources and licences. */
  licenceDataset?: string;
  /** The Originals row's publisher: "Hansard", or a host the line never shows. */
  original: string;
  notes: string[];
}

const OPENAUSTRALIA_NOTE =
  'This text comes from OpenAustralia’s transcription of Hansard. It can join words together, for example "toSenator". Check the wording against Hansard before you quote it.';

/** The one inline caveat (records.md 2.2): OpenAustralia text only. */
export function recordCaveat(doc: DocumentRecord): string | null {
  return doc.labels.source === 'openaustralia'
    ? 'Third-party transcription. Check Hansard before quoting.'
    : null;
}

/** Publishers named by their own site; any other host is "Original publisher". */
function publisher(where: string): string | null {
  if (where === 'pm.gov.au') return 'Prime Minister’s media releases';
  if (/^minister\.[a-z0-9-]+\.gov\.au$/.test(where))
    return 'Ministerial media releases';
  if (where === 'grants.gov.au') return 'GrantConnect';
  if (where === 'tenders.gov.au') return 'AusTender';
  if (where === 'aph.gov.au' || where === 'parlinfo.aph.gov.au')
    return 'Parliament of Australia';
  if (where === 'legislation.gov.au') return 'Federal Register of Legislation';
  return null;
}

/** The record's source, said as its line and sheet say it. */
export function recordSource(doc: DocumentRecord): RecordSource {
  const kind = doc.labels.kind ?? '';
  const federal = (doc.labels.state ?? 'federal') === 'federal';
  const where = host(doc.url);
  const notes = [
    doc.labels.source === 'openaustralia' ? OPENAUSTRALIA_NOTE : null,
    kind === 'bill_text'
      ? doc.metadata.complete === false
        ? 'This text is incomplete. Use the original document for the full bill.'
        : 'Published bill text. The original document has the authoritative wording and layout.'
      : null,
  ].filter((note): note is string => !!note);
  if (kind === 'division' && where === 'theyvoteforyou.org.au')
    return {
      citation: {
        label: 'They Vote For You',
        title: 'They Vote For You divisions',
      },
      licence: 'ODbL',
      licenceDataset: 'tvfy',
      original: 'They Vote For You',
      notes,
    };
  if (kind === 'speech' || kind === 'division')
    return {
      citation: {
        label: 'Hansard',
        title:
          doc.labels.source === 'openaustralia'
            ? 'Hansard, via OpenAustralia'
            : doc.labels.source === 'zenodo'
              ? 'Hansard, via the Zenodo federal speech archive'
              : 'Hansard',
      },
      // Only federal Hansard's terms are verified (Sources and licences).
      ...(federal ? { licence: 'CC BY-NC-ND', licenceDataset: 'hansard' } : {}),
      original: 'Hansard',
      notes,
    };
  if (kind === 'bill_text')
    return {
      citation: { label: 'Original bill document' },
      licenceDataset: 'bills',
      original: 'Original bill document',
      notes,
    };
  const named = publisher(where);
  if (where === 'legislation.gov.au')
    return {
      citation: { label: named! },
      licence: 'CC BY 4.0',
      licenceDataset: 'frl',
      original: named!,
      notes,
    };
  return {
    citation: { label: named ?? 'Original publisher' },
    original: named ?? (where || 'Original publisher'),
    notes,
  };
}

const kindWords: Record<string, string> = {
  speech: 'speech',
  division: 'division',
  press_release: 'release',
  bill_text: 'bill text',
  grant_award: 'grant award',
  grant_invitation: 'grant invitation',
  contract: 'contract',
  legal: 'Act',
};

/** The Originals row: "Hansard · speech, 18 Aug 2026". */
export function recordOriginal(doc: DocumentRecord): SourceOriginal | null {
  if (!doc.url) return null;
  const source = recordSource(doc);
  const day = recordDate(doc);
  const what = kindWords[recordKind(doc)] ?? 'record';
  return {
    label: source.original,
    url: doc.url,
    record: day ? `${what}, ${formatDate(day, 'short')}` : what,
  };
}
