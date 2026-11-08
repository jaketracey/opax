import type { Answer } from './model';

/**
 * The answer reader's parser (specs/ask.md 6.2). The answer is parsed once
 * into blocks with inline spans; the streaming view calls the same parser
 * on every delta, with citations left out and unfinished Markdown held back
 * so no asterisk, pipe, bare "[1]" or raw address ever shows.
 *
 * Every span carries the index of its sentence within its block (or list
 * item, or table cell), so the sentence a citation mark belongs to can be
 * highlighted from the answer's own text. A mark after a full stop belongs
 * to the sentence before it.
 */
export type Inline =
  | { kind: 'text'; text: string; sentence: number }
  | { kind: 'strong'; text: string; sentence: number }
  | { kind: 'link'; text: string; href: string; sentence: number }
  | { kind: 'cite'; numbers: number[]; label: string; sentence: number };
export type Block =
  | { kind: 'paragraph'; spans: Inline[] }
  | { kind: 'heading'; spans: Inline[] }
  | { kind: 'bullets'; items: Inline[][] }
  | { kind: 'numbered'; items: Inline[][]; start: number }
  | { kind: 'quote'; spans: Inline[] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] };

/**
 * The answer with " [n]" after each cited span. Offsets are Unicode code
 * points, as the Worker's normaliseFootnotes sends them; `n` is the source's
 * place among the cited sources, in source order.
 */
export function citedAnswer(answer: Answer): string {
  const points = Array.from(answer.answer),
    ends = new Map<number, number[]>();
  answer.sources
    .filter((s) => s.cited)
    .forEach((s, i) => {
      for (const [, end] of s.answerRanges)
        if (end <= points.length) {
          const ids = ends.get(end) || [];
          if (!ids.includes(i + 1)) ids.push(i + 1);
          ends.set(end, ids);
        }
    });
  return points
    .map(
      (p, i) =>
        p +
        (ends
          .get(i + 1)
          ?.map((n) => ` [${n}]`)
          .join('') || ''),
    )
    .join('');
}

/** "1", "1, 2", "1 to 3", "1, 3". A run of three or more reads as a range. */
export function citeLabel(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const consecutive =
    sorted.length >= 3 &&
    sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1);
  return consecutive ? `${sorted[0]} to ${sorted.at(-1)}` : sorted.join(', ');
}

const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const EMPTY_MARKER = /^\s*(?:[-*+]|\d+[.)])\s*$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const SENTENCE_END = /[.!?]["'”’)\]]*\s+/g;
const ENDS_SENTENCE = /[.!?]["'”’)\]]*$/;

function cells(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|').map((cell) => cell.trim());
}

/** Emphasis markers the reader never sees: stray asterisks, edge underscores. */
function bare(text: string): string {
  return text
    .replace(/\*+/g, '')
    .replace(/(^|[^\p{L}\p{N}])_+(?=\S)/gu, '$1')
    .replace(/(\S)_+(?=[^\p{L}\p{N}]|$)/gu, '$1');
}

type Raw =
  | { kind: 'text' | 'strong'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'cite'; numbers: number[] };

const INLINE = /\[([^\]\n]+)\]\(([^)\s]*)\)|\*\*(.+?)\*\*|((?:\s*\[\d+\])+)/g;

function tokens(text: string, streaming: boolean): Raw[] {
  // An unclosed ** draws its words without the asterisks.
  const out: Raw[] = [];
  let last = 0;
  const push = (raw: Raw) => {
    const prev = out.at(-1);
    if (raw.kind === 'text' && !raw.text) return;
    if (raw.kind === 'text' && prev?.kind === 'text') prev.text += raw.text;
    else out.push(raw);
  };
  for (const m of text.matchAll(INLINE)) {
    push({ kind: 'text', text: bare(text.slice(last, m.index)) });
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      const href = m[2] ?? '';
      if (/^https?:\/\/\S+$/i.test(href) || href.startsWith('/'))
        out.push({ kind: 'link', text: bare(m[1]), href });
      else push({ kind: 'text', text: bare(m[1]) });
    } else if (m[3] !== undefined)
      out.push({ kind: 'strong', text: bare(m[3]) });
    else if (!streaming) {
      const numbers = [...m[4]!.matchAll(/\[(\d+)\]/g)].map((n) =>
        Number(n[1]),
      );
      out.push({ kind: 'cite', numbers });
    }
  }
  push({ kind: 'text', text: bare(text.slice(last)) });
  return out;
}

/** Splits text spans at sentence ends and numbers every span's sentence. */
function inline(text: string, streaming: boolean): Inline[] {
  const spans: Inline[] = [];
  let sentence = 0;
  let pendingEnd = false;
  for (const raw of tokens(text, streaming)) {
    if (raw.kind === 'cite') {
      const numbers = [...new Set(raw.numbers)].sort((a, b) => a - b);
      spans.push({
        kind: 'cite',
        numbers,
        label: citeLabel(numbers),
        sentence,
      });
      continue;
    }
    const rest = raw.text;
    if (pendingEnd && /^\s/.test(rest)) sentence++;
    const pieces: string[] = [];
    let start = 0;
    for (const m of rest.matchAll(SENTENCE_END)) {
      const end = m.index + m[0].length;
      if (end >= rest.length) break; // Trailing: decided by what follows.
      pieces.push(rest.slice(start, end));
      start = end;
    }
    pieces.push(rest.slice(start));
    pieces.forEach((piece, i) => {
      if (i > 0) sentence++;
      if (!piece) return;
      spans.push(
        raw.kind === 'link'
          ? { kind: 'link', text: piece, href: raw.href, sentence }
          : { kind: raw.kind, text: piece, sentence },
      );
    });
    pendingEnd = ENDS_SENTENCE.test(rest);
    if (/[.!?]["'”’)\]]*\s+$/.test(rest)) {
      // Whitespace already passed the end: the next span starts a sentence.
      sentence++;
      pendingEnd = false;
    }
  }
  return spans;
}

/** Holds back what a delta has only half sent (streaming only). */
function settle(text: string): string {
  let out = text
    .replace(/[ \t]?\[\d+\]/g, '')
    .replace(/\[\d*$/, '')
    .replace(/\[([^\]\n]*)\]\([^)\n]*$/, '$1')
    .replace(/\[([^\]\n]*)\]$/, '$1')
    .replace(/\[([^\]\n]*)$/, '$1');
  // A last line still arriving: a table row is not drawn until it ends.
  if (!out.endsWith('\n')) {
    const lines = out.split('\n');
    if (lines.at(-1)!.includes('|')) lines.pop();
    out = lines.join('\n');
  }
  // An odd ** count: the last one is still open.
  const pairs = out.match(/\*\*/g)?.length ?? 0;
  if (pairs % 2) {
    const at = out.lastIndexOf('**');
    out = out.slice(0, at) + out.slice(at + 2);
  }
  return out;
}

export function parseAnswer(
  text: string,
  { streaming = false }: { streaming?: boolean } = {},
): Block[] {
  const source = streaming ? settle(text) : text;
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const read = (value: string) => inline(value.trim(), streaming);
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      const spans = read(paragraph.join(' '));
      if (spans.length) blocks.push({ kind: 'paragraph', spans });
    }
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) {
      flush();
      continue;
    }
    if (EMPTY_MARKER.test(line)) {
      flush();
      continue;
    }
    if (
      line.includes('|') &&
      SEPARATOR.test(lines[i + 1] ?? '') &&
      !SEPARATOR.test(line)
    ) {
      flush();
      const header = cells(line).map(read);
      const rows: Inline[][][] = [];
      i++;
      while (
        i + 1 < lines.length &&
        lines[i + 1]!.includes('|') &&
        lines[i + 1]!.trim()
      ) {
        i++;
        rows.push(cells(lines[i]!).map(read));
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }
    // A table header with no separator yet, or a stray pipe line: held back.
    if (streaming && line.includes('|')) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const spans = read(heading[1]!);
      if (spans.length) blocks.push({ kind: 'heading', spans });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const items: string[] = [];
      const start = numbered ? Number(numbered[1]) : 1;
      const kind = bullet ? 'bullets' : 'numbered';
      const marker = bullet ? BULLET : NUMBERED;
      let match: RegExpExecArray | null = bullet ?? numbered;
      while (match) {
        items.push(bullet ? match[1]! : match[2]!);
        // Wrapped lines belong to the item above.
        while (
          i + 1 < lines.length &&
          /^\s+\S/.test(lines[i + 1]!) &&
          !BULLET.test(lines[i + 1]!) &&
          !NUMBERED.test(lines[i + 1]!)
        )
          items[items.length - 1] += ` ${lines[++i]!.trim()}`;
        const next = lines[i + 1];
        match = next !== undefined ? marker.exec(next) : null;
        if (match) i++;
      }
      const parsed = items.map(read).filter((item) => item.length);
      if (parsed.length)
        blocks.push(
          kind === 'bullets'
            ? { kind, items: parsed }
            : { kind, items: parsed, start },
        );
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote) {
      flush();
      const parts = [quote[1]!];
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1]!))
        parts.push(QUOTE.exec(lines[++i]!)![1]!);
      const spans = read(parts.join(' '));
      if (spans.length) blocks.push({ kind: 'quote', spans });
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

export function answerBlocks(answer: Answer): Block[] {
  return parseAnswer(citedAnswer(answer));
}

function spanText(spans: Inline[]): string {
  return spans
    .map((span) =>
      span.kind === 'cite'
        ? ` ${span.numbers.map((n) => `[${n}]`).join('')}`
        : span.text,
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
/** The answer as plain text, for Copy, Share and reports. */
export function plainText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case 'bullets':
          return block.items.map((item) => `- ${spanText(item)}`).join('\n');
        case 'numbered':
          return block.items
            .map((item, i) => `${block.start + i}. ${spanText(item)}`)
            .join('\n');
        case 'table':
          return [block.header, ...block.rows]
            .map((row) => row.map(spanText).join(' · '))
            .join('\n');
        default:
          return spanText(block.spans);
      }
    })
    .join('\n\n');
}

/** Spans of one sentence in a run of spans (the claim a mark belongs to). */
export function sentenceSpans(spans: Inline[], sentence: number): Inline[] {
  return spans.filter((span) => span.sentence === sentence);
}
