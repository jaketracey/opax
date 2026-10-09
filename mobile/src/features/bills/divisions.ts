import { billStripTitle } from '../../api/bill-transforms';

// What a division is called and what its question says, for the bill page
// (design review D5): a division is titled by its recorded stage, and the
// record's question sits behind a disclosure, drawn from its Markdown as
// plain blocks. The renderer is a port of the web's shared, bounded one
// (portal/public/division-markdown.js): the source is always text, only
// http(s) links survive, and nothing is ever parsed as markup.

// scripts/export_bills.py DIVISION_TITLE_CASE: a recorded stage in sentence case.
const TITLE_CASE: Record<string, string> = {
  'second reading': 'Second reading',
  'third reading': 'Third reading',
  'first reading': 'First reading',
  'in committee': 'In committee',
  'consideration in detail': 'Consideration in detail',
  'consideration of senate message': 'Consideration of Senate message',
  'consideration of house of representatives message':
    'Consideration of House message',
  'limitation of debate': 'Limitation of debate',
  'committee of the whole': 'Committee of the whole',
  'report from federation chamber': 'Report from Federation Chamber',
  'reference to committee': 'Reference to committee',
  'refer to committee': 'Refer to committee',
  'adoption of report': 'Adoption of report',
  'declaration of urgency': 'Declaration of urgency',
  'motion to dissent from ruling': 'Motion to dissent from ruling',
  'agreed to amendment': 'Agreed to amendment',
  'motion to suspend standing orders': 'Motion to suspend standing orders',
};

/**
 * The export's title for a recorded stage (export_bills.division_title): the
 * stage alone in sentence case, a run-in detail after a dash dropped. No
 * stage, no title: nothing is inferred from the question or the outcome.
 */
export function stageTitle(stage: string | null | undefined): string | null {
  const s = String(stage ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  const head = s.split(/\s+[–—-]\s+/)[0]!;
  return (
    TITLE_CASE[head.toLocaleLowerCase('en-AU')] ??
    s[0]!.toUpperCase() + s.slice(1)
  );
}

/**
 * A division's title: the export's `title`; until every bill file carries
 * one, the same title from its recorded stage; then the first sentence of
 * the motion (`head`, already cleaned of the bill's name); else "Division".
 */
export function divisionTitle(division: {
  title?: string | null;
  stage?: string | null;
  head?: string | null;
}): string {
  return (
    division.title?.trim() ||
    stageTitle(division.stage) ||
    division.head?.trim() ||
    'Division'
  );
}

const PLACEHOLDER =
  /^(long debate text truncated|text truncated|no text recorded)\.?$/i;

/** The web's billNoteRepair, keeping line breaks for the block parser. */
export function repairQuestion(text: string): string {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/([*_]{1,3})(\[[^\]]+\]\([^)\s]+\))\1/g, '$2')
    .replace(
      /\[[^\]\n]+\]\([^\n]*?\)(?=\s|[.,;:]|$)|([^\s(\]*_])\(/g,
      (match, before: string | undefined) => (before ? `${before} (` : match),
    )
    .replace(/[ \t]+([.,;:])/g, '$1')
    .replace(/[ \t]+\)/g, ')')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * The question a division put, in the record's words: the bill's name and
 * the stage's run-in label removed from the front, everything else kept.
 * They Vote For You names some divisions "Motions - <bill> - Consider bill
 * now": the kind and the bill go, the motion stays. A stage is only removed
 * as a whole word ("Motion" never leaves "s - …" of "Motions"). Empty when
 * the record holds no question, only a placeholder.
 */
export function divisionQuestion(
  question: string,
  stage: string | null | undefined,
  bill: { title?: string | null; short_title?: string | null },
): string {
  const names = {
    title: bill.title ?? '',
    short_title: bill.short_title ?? null,
  };
  let text = billStripTitle(repairQuestion(question), names);
  const kind = /^[A-Z][A-Za-z ]{0,40}?\s+[-–—]\s+/.exec(text);
  if (kind) {
    const rest = text.slice(kind[0].length).trim();
    const stripped = billStripTitle(rest, names);
    if (stripped && stripped !== rest) text = stripped;
  }
  const s = String(stage ?? '').trim();
  if (
    s &&
    text.toLocaleLowerCase('en-AU').startsWith(s.toLocaleLowerCase('en-AU')) &&
    !/[\p{L}\p{N}]/u.test(text.charAt(s.length))
  ) {
    const rest = text
      .slice(s.length)
      .replace(/^\s*[-–—:]\s*/, '')
      .trim();
    if (rest) text = rest;
  }
  const plain = questionPlain(text);
  return !plain || PLACEHOLDER.test(plain) ? '' : text;
}

/** One run of inline text, with the emphasis and link the record gave it. */
export interface QuestionRun {
  text: string;
  strong?: boolean;
  emphasis?: boolean;
  /** An http(s) destination; the app's source policy decides if it opens. */
  url?: string;
}
export type QuestionBlock =
  | { kind: 'paragraph' | 'heading'; lines: QuestionRun[][] }
  | { kind: 'quote'; blocks: QuestionBlock[] }
  | { kind: 'list'; ordered: boolean; start: number; items: QuestionRun[][][] };

// Relative links in They Vote For You's notes are its own pages.
const NOTE_BASE = 'https://theyvoteforyou.org.au';
// Backslash escapes ("\_\_\_") are kept as their characters, out of reach of
// the emphasis tokens.
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!>])/g;
const escapeMark = (c: string) => `${c.charCodeAt(0)}`;
const unescapeMarks = (s: string) =>
  s.replace(/(\d+)/g, (_, code: string) => String.fromCharCode(Number(code)));

/**
 * Some exports already collapsed the block boundaries. Recover only explicit
 * markers after a sentence or a colon, never an ordinary "a > b"; a flattened
 * question heading ends at its question mark (web blockLines).
 */
function blockLines(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/([.!?)][*_]?)[ \t]+(#{1,3}[ \t]+)/g, '$1\n\n$2')
    .replace(/(^#{1,3}[ \t]+[^\n>]+?)[ \t]+(?=>[ \t])/gm, '$1\n\n')
    .replace(/(^#{1,3}[ \t]+[^\n?]+\?)[ \t]+(?=\S)/gm, '$1\n\n')
    .replace(/:[ \t]+>[ \t]+/g, ':\n\n> ')
    .replace(/^[ \t]*>[^\n]*$/gm, (line) =>
      line.replace(/[ \t]+>[ \t]+>[ \t]+/g, '\n>\n> '),
    );
}

const INLINE =
  /\[([^\]\n]+)\]\(([^\s()]+(?:\([^\s()]*\)[^\s()]*)*)(?:[ \t]+"[^"\n]*")?\)|\*\*(\S(?:[^*\n]*?\S)?)\*\*|\*(\S(?:[^*\n]*?\S)?)\*|\b_(\S(?:[^_\n]*?\S)?)_\b/g;

function linkUrl(raw: string): string | undefined {
  const value = /^\/(?!\/)/.test(raw) ? NOTE_BASE + raw : raw;
  if (!/^https?:\/\//i.test(value) || /[\u0000- \u007f]/.test(value))
    return undefined;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Inline runs, tokenised before anything else so no text is reparsed. */
function inline(
  text: string,
  style: Omit<QuestionRun, 'text'> = {},
  depth = 0,
): QuestionRun[] {
  if (depth > 8) return [{ ...style, text: unescapeMarks(text) }];
  const out: QuestionRun[] = [];
  let last = 0;
  const plain = (s: string) => {
    if (s) out.push({ ...style, text: unescapeMarks(s) });
  };
  for (const m of text.matchAll(INLINE)) {
    plain(text.slice(last, m.index));
    if (m[1] !== undefined) {
      // A link's label keeps its emphasis; links never nest.
      const url = style.url ? undefined : linkUrl(unescapeMarks(m[2]!));
      out.push(...inline(m[1], url ? { ...style, url } : style, depth + 1));
    } else {
      const strong = m[3] !== undefined;
      out.push(
        ...inline(
          m[3] ?? m[4] ?? m[5]!,
          strong ? { ...style, strong: true } : { ...style, emphasis: true },
          depth + 1,
        ),
      );
    }
    last = m.index + m[0].length;
  }
  plain(text.slice(last));
  // Neighbouring runs drawn alike join, so the text reads as one string.
  return out.reduce<QuestionRun[]>((runs, run) => {
    const prev = runs[runs.length - 1];
    if (
      prev &&
      prev.strong === run.strong &&
      prev.emphasis === run.emphasis &&
      prev.url === run.url
    )
      prev.text += run.text;
    else runs.push({ ...run });
    return runs;
  }, []);
}

const LIST_ITEM = /^\s*(?:([-*])\s+|(\d+)[.)]\s+)(.*)$/;
const startsBlock = (line: string) =>
  /^\s*(?:#{1,3}\s+|>\s?)/.test(line) || LIST_ITEM.test(line);

function blocks(lines: readonly string[], depth: number): QuestionBlock[] {
  const out: QuestionBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^\s*#{1,3}\s+(.+)$/.exec(line);
    if (heading) {
      out.push({ kind: 'heading', lines: [inline(heading[1]!)] });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!))
        quote.push(lines[i++]!.replace(/^\s*>[ \t]?/, ''));
      out.push({
        kind: 'quote',
        blocks:
          depth > 8
            ? [{ kind: 'paragraph', lines: quote.map((q) => inline(q)) }]
            : blocks(quote, depth + 1),
      });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = item[2] !== undefined;
      const list: QuestionBlock & { kind: 'list' } = {
        kind: 'list',
        ordered,
        start: ordered ? Number(item[2]) : 1,
        items: [],
      };
      while (i < lines.length) {
        const next = LIST_ITEM.exec(lines[i]!);
        if (!next || (next[2] !== undefined) !== ordered) break;
        i++;
        const body = [inline(next[3]!)];
        while (i < lines.length && lines[i]!.trim() && !startsBlock(lines[i]!))
          body.push(inline(lines[i++]!));
        list.items.push(body);
      }
      out.push(list);
      continue;
    }
    const para = [inline(lines[i++]!)];
    while (i < lines.length && lines[i]!.trim() && !startsBlock(lines[i]!))
      para.push(inline(lines[i++]!));
    out.push({ kind: 'paragraph', lines: para });
  }
  return out;
}

/** The question as blocks: headings, paragraphs, quotes and lists. */
export function questionBlocks(text: string): QuestionBlock[] {
  const marked = text.replace(ESCAPED, (_, c: string) => escapeMark(c));
  return blocks(blockLines(repairQuestion(marked)).split('\n'), 0);
}

/** The question's words with no Markdown: for search, counts and VoiceOver. */
export function questionPlain(text: string): string {
  const flat = (bs: readonly QuestionBlock[]): string[] =>
    bs.flatMap((b) =>
      b.kind === 'quote'
        ? flat(b.blocks)
        : b.kind === 'list'
          ? b.items.flatMap((item) =>
              item.map((line) => line.map((r) => r.text).join('')),
            )
          : b.lines.map((line) => line.map((r) => r.text).join('')),
    );
  return flat(questionBlocks(text)).join(' ').replace(/\s+/g, ' ').trim();
}
