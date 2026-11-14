import { billTextPathPattern, isRecordSlug } from '../../api/record-policy';
import { decodeEntities } from '../../api/passage-text';
import {
  array,
  date,
  invalid,
  nonempty,
  object,
  optional,
  text,
  url,
} from '../../api/validation';
import { formatDate } from '../../design/format';
import { chamberName, jurisdictionName } from '../../design/parliament';
import { titleSubject } from './citations';

export interface DocumentRecord {
  slug: string;
  title: string;
  speaker: string | null;
  url: string | null;
  labels: Record<string, string>;
  topics: string[];
  metadata: Record<string, unknown>;
  summary: string | null;
  text: string;
}
export function recordSlug(value: unknown): string {
  const slug = nonempty(value);
  return isRecordSlug(slug)
    ? slug
    : invalid('This link doesn’t open a record.');
}
// /api/resource sends origin.url as-is, so records without an official link
// (the 1990s federal speeches from Zenodo) arrive with url ''. A blank or
// unreadable link only drops "View original"; it never hides the record.
function sourceLink(value: unknown): string | null {
  try {
    return optional(url)(value) ?? null;
  } catch {
    return null;
  }
}
export function decodeDocument(value: unknown): DocumentRecord {
  const raw = object(value),
    labels = object(raw.labels);
  const slug = recordSlug(raw.slug);
  const kind = text(labels.kind ?? slug.split('-')[0]);
  return {
    slug,
    title: nonempty(raw.title),
    speaker:
      kind === 'division' || kind === 'bill_text'
        ? null
        : (optional(text)(raw.speaker) ?? null),
    url: sourceLink(raw.url),
    labels: Object.fromEntries(
      Object.entries(labels).map(([key, value]) => [key, text(value)]),
    ),
    topics: array(text)(raw.topics ?? []),
    metadata: object(raw.metadata ?? {}),
    summary: optional(text)(raw.summary) ?? null,
    text: text(raw.text),
  };
}
/** /api/resource normalizes every text but bill text, which it sends
 * verbatim (entities and all) for the web's /doc reader. */
export const isVerbatimText = (doc: DocumentRecord) =>
  doc.labels.kind === 'bill_text' || doc.slug.startsWith('bill-text-');
export const metaString = (doc: DocumentRecord, key: string) =>
  typeof doc.metadata[key] === 'string' ? (doc.metadata[key] as string) : '';
/** One row of `/api/recent`. Only slug, title and the date added are sure. */
export interface RecentItem {
  slug: string;
  title: string;
  indexed: string | null;
  kind?: string;
  date?: string;
  chamber?: string;
  state?: string;
  speaker?: string;
  party?: string;
  bill_ref?: string;
  subject?: string;
}
/** The feed's rows; `partial` when an unreadable row was dropped. */
export type RecentFeed = RecentItem[] & { partial?: boolean };
const optionalText = (value: unknown) => {
  try {
    const read = optional(text)(value)?.trim();
    return read ? read : undefined;
  } catch {
    return undefined;
  }
};
/**
 * `/api/recent` sends slug, title and the date added; the Worker may add the
 * kind, date, chamber, place, speaker, party and a division's bill. One
 * unreadable row is dropped (the line says "partial"), never the whole list.
 */
export function decodeRecent(value: unknown): RecentFeed {
  const raw = object(value);
  const rows = Array.isArray(raw.items) ? (raw.items as unknown[]) : invalid();
  const items: RecentFeed = [];
  let dropped = false;
  for (const row of rows) {
    try {
      const item = object(row);
      const day = optionalText(item.date)?.slice(0, 10);
      const extra = {
        kind: optionalText(item.kind),
        date: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined,
        chamber: optionalText(item.chamber),
        state: optionalText(item.state),
        speaker: optionalText(item.speaker),
        party: optionalText(item.party),
        bill_ref: optionalText(item.bill_ref),
        subject: optionalText(item.subject),
      };
      items.push({
        slug: recordSlug(item.slug),
        title: nonempty(item.title),
        indexed: optional(date)(item.indexed) ?? null,
        ...Object.fromEntries(
          Object.entries(extra).filter(([, entry]) => entry !== undefined),
        ),
      });
    } catch {
      dropped = true;
    }
  }
  // One bad row is dropped; a feed with no readable row at all is unreadable.
  if (dropped && !items.length) invalid();
  if (dropped) items.partial = true;
  return items;
}
export function decodeSimilar(value: unknown) {
  return array((value: unknown) => {
    const raw = object(value);
    return {
      slug: recordSlug(raw.slug),
      title: nonempty(raw.title),
      speaker: optional(text)(raw.speaker) ?? null,
      date: optional(date)(raw.date) ?? null,
      snippet: optional(text)(raw.snippet) ?? '',
      party: optionalText(raw.party) ?? null,
      chamber: optionalText(raw.chamber) ?? null,
      url: (() => {
        try {
          return optional(url)(raw.url) ?? null;
        } catch {
          return null;
        }
      })(),
    };
  })(object(value).results);
}
export interface BillTextVersion {
  id: string;
  stage: string;
  stage_label: string;
  date: string | null;
  source_url: string;
  text_url: string;
  sha256: string;
}
function decodeVersion(value: unknown): BillTextVersion {
  const raw = object(value),
    id = nonempty(raw.id),
    path = nonempty(raw.text_url);
  if (
    !/^[rs]\d+-[a-z0-9-]+$/.test(id) ||
    raw.status !== 'complete' ||
    !billTextPathPattern.test(path) ||
    !path.endsWith(`/${id}.json`) ||
    !/^[a-f0-9]{64}$/.test(text(raw.sha256))
  )
    invalid();
  return {
    id,
    stage: nonempty(raw.stage),
    stage_label: nonempty(raw.stage_label),
    date: optional(date)(raw.date) ?? null,
    source_url: url(raw.source_url),
    text_url: path,
    sha256: text(raw.sha256),
  };
}
const textKey = (value: unknown) => {
  const key = nonempty(value);
  return /^au-federal-[a-z0-9-]{1,140}$/.test(key) ? key : invalid();
};
function checkVersionKey(version: BillTextVersion, key: string) {
  if (
    version.text_url !== `/bill-texts/${key}/${version.id}.json` ||
    (/^au-federal-[rs]\d+$/.test(key) &&
      !version.id.startsWith(`${key.slice(11)}-`))
  )
    invalid();
}
export function decodeBillTextManifest(value: unknown) {
  const raw = object(value),
    key = textKey(raw.bill_key),
    versions = array(decodeVersion)(raw.versions);
  versions.forEach((version) => checkVersionKey(version, key));
  const selected = nonempty(raw.default_version_id);
  if (
    !versions.length ||
    !versions.some((version) => version.id === selected) ||
    new Set(versions.map((version) => version.id)).size !== versions.length
  )
    invalid();
  return {
    bill_key: key,
    title: nonempty(raw.title),
    generated_at: date(raw.generated_at),
    default_version_id: selected,
    versions,
    coverage_note: nonempty(raw.coverage_note),
  };
}
export function decodeBillText(value: unknown) {
  const raw = object(value),
    key = textKey(raw.bill_key),
    version = decodeVersion(raw.version),
    fullText = text(raw.text);
  checkVersionKey(version, key);
  if (raw.complete !== true || !fullText.length) invalid();
  const sections = array((value: unknown) => {
    const raw = object(value);
    return {
      id: nonempty(raw.id),
      title: nonempty(raw.title),
      text: text(raw.text),
      source_url: url(raw.source_url),
    };
  })(raw.sections);
  if (
    !sections.length ||
    sections.map((section) => section.text).join('\n\n') !== fullText ||
    new Set(sections.map((section) => section.id)).size !== sections.length
  )
    invalid();
  let enrichment: {
    brief: string;
    evidence: { quote: string; section_id: string }[];
  } | null = null;
  if (raw.enrichment != null) {
    const entry = object(raw.enrichment);
    const evidence = array((value: unknown) => {
      const raw = object(value),
        quote = nonempty(raw.quote),
        section_id = nonempty(raw.section_id);
      if (
        !sections.some(
          (section) =>
            section.id === section_id && section.text.includes(quote),
        )
      )
        invalid();
      return { quote, section_id };
    })(entry.evidence);
    enrichment = { brief: nonempty(entry.brief), evidence };
  }
  return {
    bill_key: key,
    title: nonempty(raw.title),
    version,
    text: fullText,
    sections,
    enrichment,
  };
}

/**
 * Contiguous source slices that break at paragraph ends, so a quote inside
 * one paragraph selects in one drag. A paragraph longer than the target
 * splits at a sentence end. Never elide words or cut a sentence.
 */
export function textChunks(text: string, target = 1200): string[] {
  const chunks: string[] = [];
  let start = 0;
  let paragraph = 0;
  for (const match of text.matchAll(/[.!?]["'”’)]*(?=\s|$)|\r?\n/g)) {
    const end = match.index! + match[0].length;
    if (match[0].endsWith('\n')) {
      if (end - start >= target) {
        chunks.push(text.slice(start, end));
        start = end;
      }
      paragraph = end;
      continue;
    }
    if (end - paragraph < target || end - start < target) continue;
    // A long paragraph: what came before it is its own slice.
    if (paragraph > start) {
      chunks.push(text.slice(start, paragraph));
      start = paragraph;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) chunks.push(text.slice(start));
  return chunks;
}

// Record titles, meta lines and kind names, shared by the reader, Citation
// formats, Just added, Similar speeches and the ⋯ menu (records.md 2.4).

/** What a record is, in words, by its kind. */
export const kindNames: Record<string, string> = {
  speech: 'Speech',
  division: 'Division',
  press_release: 'Government release',
  bill_text: 'Bill text',
  grant_invitation: 'Grant invitation',
  grant_award: 'Published grant award',
  contract: 'Government contract',
  research_report: 'Research source note',
  legal: 'Legal record',
};
/** The fields a title or meta line reads; a recent row has fewer. */
export interface RecordLike {
  slug: string;
  title: string;
  speaker?: string | null;
  labels?: Record<string, string>;
  metadata?: Record<string, unknown>;
  /** The record's own date (an ISO day), where the caller knows it. */
  date?: string | null;
}
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DASH = /\s+\u2014\s+/;
const DIVISION =
  /^(Senate|House of Representatives) division, (\d{4}-\d{2}-\d{2}):\s*([\s\S]*)$/;
const field = (rec: RecordLike, key: string) =>
  typeof rec.metadata?.[key] === 'string'
    ? (rec.metadata[key] as string).trim()
    : '';
/** The kind from the labels, else from the slug (a recent row). */
export function recordKind(rec: RecordLike): string {
  if (rec.labels?.kind) return rec.labels.kind;
  const slug = rec.slug;
  if (slug.startsWith('bill-text-')) return 'bill_text';
  if (slug.startsWith('speech-')) return 'speech';
  if (slug.startsWith('division-')) return 'division';
  if (slug.startsWith('press-')) return 'press_release';
  if (/^grant(?:connect)?-award-/.test(slug)) return 'grant_award';
  return '';
}
/** A stored title's parts: "Speaker \u2014 Debate \u2014 2026-08-18". */
function storedParts(title: string) {
  const parts = title.trim().split(DASH);
  const last = parts.at(-1) ?? '';
  const date = parts.length > 1 && ISO_DAY.test(last) ? last : null;
  const body = date ? parts.slice(0, -1) : parts;
  return { date, body };
}
/** "Speaker \u2014 Debate \u2014 2026-08-18", or a speech's "Speaker \u2014 2026-08-18". */
function titleSpeaker(rec: RecordLike): string | null {
  const { date, body } = storedParts(rec.title);
  if (!date) return null;
  if (body.length >= 2) return body[0]!;
  return recordKind(rec) === 'speech' ? (body[0] ?? null) : null;
}
/** The record's own day: its date field, else the one in its stored title. */
export function recordDate(rec: RecordLike): string | null {
  const own = (rec.date ?? field(rec, 'date')).slice(0, 10);
  if (ISO_DAY.test(own)) return own;
  const division = DIVISION.exec(rec.title);
  if (division) return division[2]!;
  return storedParts(rec.title).date;
}
/** "Mr Speaker \u2014 2026-08-18" read as written: dashes and ISO dates go. */
function plainTitle(title: string): string {
  let first = true;
  return title
    .replace(/\s+\u2014\s+|\u2014/g, () => {
      const join = first ? ': ' : ', ';
      first = false;
      return join;
    })
    .replace(
      /\b(\d{4}-\d{2}-\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
      (day) => formatDate(day.slice(0, 10), 'short'),
    )
    .replace(/\s+/g, ' ')
    .trim();
}
const PROCEDURAL =
  /^(?:Pursuant to\b|I will (?:now|first|then)\b|The question is\b|I shall\b)/i;
/** A division's subject from its stored question (records.md 2.4 rule 1). */
function divisionHeadline(rec: RecordLike, chamber: string, rest: string) {
  const subject = field(rec, 'subject') || field(rec, 'bill_ref');
  if (subject) return plainTitle(decodeEntities(subject));
  const question =
    /The question is that\s+([\s\S]*?)(?:[.?!](?=\s|[A-Z]|$)|$)/.exec(rest);
  const clause = question?.[1]?.replace(/\s+/g, ' ').trim();
  if (clause) return `That ${clause}`;
  const from = rest.search(/\bPursuant\b/);
  const sentences = (from > 0 ? rest.slice(from) : rest)
    .split(/(?<=[.?!])\s*(?=[A-Z])/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence && !PROCEDURAL.test(sentence));
  const first = sentences[0]?.replace(/[.]+$/, '');
  if (first && first.length >= 12 && first.length <= 140) return first;
  return `${chamber} division`;
}
/**
 * The title shown for a record everywhere OPAX shows one: never the speaker
 * or role prefix, an ISO date, a division's "Senate division, 2026-08-19:"
 * preamble or an em dash.
 */
export function recordHeadline(
  rec: RecordLike,
  { titleDecoded = false }: { titleDecoded?: boolean } = {},
): string {
  // Pane entries carry a presented title; server records still carry entities.
  if (!titleDecoded)
    rec = {
      ...rec,
      title: decodeEntities(rec.title),
      speaker: rec.speaker ? decodeEntities(rec.speaker) : rec.speaker,
    };
  const division = DIVISION.exec(rec.title.trim());
  if (division) return divisionHeadline(rec, division[1]!, division[3]!);
  const speaker = rec.speaker ?? titleSpeaker(rec);
  const date = recordDate(rec);
  const subject = titleSubject({
    title: rec.title,
    speaker,
    date,
    labels: rec.labels,
    metadata: rec.metadata,
  });
  if (subject && !(speaker && subject.trim() === speaker.trim()))
    return plainTitle(subject);
  if (date) {
    const kind = kindNames[recordKind(rec)] ?? 'Record';
    return `${kind} · ${formatDate(date)}`;
  }
  return plainTitle(rec.title);
}
/** True when the headline is itself the kind and the date. */
const headlineIsKind = (rec: RecordLike, headline: string) =>
  / · \d{1,2} [A-Z][a-z]+ \d{4}$/.test(headline) &&
  headline.startsWith(`${kindNames[recordKind(rec)] ?? 'Record'} · `);
/**
 * The one line above a record's title, or under a row's: kind, chamber,
 * place and, unless a reader passes `date: false` (its source line dates it),
 * the record's date. Parts the headline already says are left off.
 */
export function metaLine(
  rec: RecordLike,
  { date: dated = true }: { date?: boolean } = {},
): string {
  const headline = recordHeadline(rec);
  const kind = recordKind(rec);
  const division = DIVISION.exec(rec.title.trim());
  const bare = !!division && headline === `${division[1]} division`;
  const kindTitle = headlineIsKind(rec, headline);
  const day = recordDate(rec);
  const place = jurisdictionName(rec.labels?.state);
  const stage =
    kind === 'bill_text' ? plainTitle(field(rec, 'stage_label')) : '';
  return [
    bare || kindTitle ? null : (kindNames[kind] ?? null),
    stage || null,
    bare
      ? null
      : (chamberName(rec.labels?.chamber, rec.labels?.state) ??
        division?.[1] ??
        null),
    place && place !== 'Federal' ? place : null,
    dated && !kindTitle && day ? formatDate(day, 'short') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
/** A recent row read as a record: its speaker and date from the title. */
export function recentRecord(item: RecentItem): RecordLike & {
  speakerName: string | null;
  party: string | null;
} {
  const kind = item.kind ?? recordKind({ slug: item.slug, title: item.title });
  const speaker =
    item.speaker ??
    titleSpeaker({ slug: item.slug, title: item.title, labels: { kind } });
  return {
    slug: item.slug,
    title: item.title,
    speaker,
    labels: {
      ...(kind ? { kind } : {}),
      ...(item.chamber ? { chamber: item.chamber } : {}),
      ...(item.state ? { state: item.state } : {}),
    },
    metadata: {
      ...(item.bill_ref ? { bill_ref: item.bill_ref } : {}),
      ...(item.subject ? { subject: item.subject } : {}),
    },
    date: item.date ?? null,
    speakerName: speaker,
    party: item.party ?? null,
  };
}
/** A version's short stage for the bar: "As introduced", "As passed". */
export function shortStage(version: { stage_label: string }): string {
  const label = version.stage_label;
  if (/\bintroduced\b|\bfirst reading\b/i.test(label)) return 'As introduced';
  if (/\bpassed\b/i.test(label)) return 'As passed';
  if (/\bamend/i.test(label)) return 'As amended';
  return plainTitle(label);
}
/** A stage label as drawn: "As passed: synthetic fixture". */
export const stageText = (label: string) => plainTitle(label);
/** The first `count` whole sentences, never cut mid-sentence. */
export function firstSentences(sentences: readonly string[], count = 3) {
  return sentences
    .flatMap((part) =>
      part
        .split(/(?<=[.?!]["'”’)]*)\s+(?=[A-Z0-9“"'‘(])/)
        .map((sentence) => sentence.trim()),
    )
    .filter(Boolean)
    .slice(0, count);
}
