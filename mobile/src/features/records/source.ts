// Who holds a record the reader shows, for its one source line (pass 5,
// P1-2): the original's publisher, its licence where Sources and licences
// verifies one, and the notes that used to sit behind the Full text ⓘ.
import type { SourceCitation } from '../../design/primitives';
import { metaString, type DocumentRecord } from './model';

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
  /** The original's own name in the sheet: "Original record". */
  original: string;
  notes: string[];
}

/** The record's source, said as its line and sheet say it. */
export function recordSource(doc: DocumentRecord): RecordSource {
  const kind = doc.labels.kind ?? '';
  const federal = (doc.labels.state ?? 'federal') === 'federal';
  const where = host(doc.url);
  const notes = [
    doc.labels.source === 'openaustralia'
      ? 'This text is reproduced from a third-party Hansard transcription and may contain concatenation artefacts (“toSenator”); verify wording against the official record before quoting.'
      : null,
    kind === 'bill_text'
      ? doc.metadata.complete === false
        ? 'Incomplete extracted bill text. Use the original document for the complete bill.'
        : 'Published bill text. Check the original document for authoritative wording and formatting.'
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
      original: 'Division record',
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
      original: kind === 'speech' ? 'Speech in Hansard' : 'Division in Hansard',
      notes,
    };
  if (kind === 'bill_text')
    return {
      citation: {
        label: 'Original bill document',
        title: metaString(doc, 'title') || 'Original bill document',
      },
      licenceDataset: 'bills',
      original: 'Original bill document',
      notes,
    };
  if (where === 'aph.gov.au')
    return {
      citation: { label: 'Parliament of Australia' },
      original: 'Original record',
      notes,
    };
  if (where === 'legislation.gov.au')
    return {
      citation: { label: 'Federal Register of Legislation' },
      licence: 'CC BY 4.0',
      licenceDataset: 'frl',
      original: 'Original record',
      notes,
    };
  return {
    citation: { label: where || 'OPAX public record' },
    original: 'Original record',
    notes,
  };
}
