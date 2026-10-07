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
import { isRecordSlug, billTextPathPattern } from '../../api/record-policy';

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
    : invalid('This record identifier cannot be read.');
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
    url: optional(url)(raw.url) ?? null,
    labels: Object.fromEntries(
      Object.entries(labels).map(([key, value]) => [key, text(value)]),
    ),
    topics: array(text)(raw.topics ?? []),
    metadata: object(raw.metadata ?? {}),
    summary: optional(text)(raw.summary) ?? null,
    text: text(raw.text),
  };
}
export const metaString = (doc: DocumentRecord, key: string) =>
  typeof doc.metadata[key] === 'string' ? (doc.metadata[key] as string) : '';
export function decodeRecent(value: unknown) {
  return array((value: unknown) => {
    const raw = object(value);
    return {
      slug: recordSlug(raw.slug),
      title: nonempty(raw.title),
      indexed: optional(date)(raw.indexed) ?? null,
    };
  })(object(value).items);
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

/** Contiguous source slices. Never elide words or cut a sentence for a preview. */
export function textChunks(text: string, target = 1200): string[] {
  const chunks: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?]["'”’)]*(?=\s|$)|\r?\n/g)) {
    const end = match.index! + match[0].length;
    if (end - start >= target) {
      chunks.push(text.slice(start, end));
      start = end;
    }
  }
  if (start < text.length) chunks.push(text.slice(start));
  return chunks;
}
