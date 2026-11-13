import { billStripTitle } from '../../api/bill-transforms';

// What a division is called and what its question says, for the bill page
// (design review D5, sweep 3): a division is titled by its recorded stage
// or the substantive motion put under a time limit, and the
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
  const head = s.split(/\s+[–\u2014-]\s+/)[0]!;
  return (
    TITLE_CASE[head.toLocaleLowerCase('en-AU')] ??
    s[0]!.toUpperCase() + s.slice(1)
  );
}

/**
 * A time-limited substantive vote names the decision. Otherwise the
 * division's title is the export's `title`; until every bill file carries
 * one, the same title from its recorded stage; then the first sentence of
 * the motion (`head`, already cleaned of the bill's name); else "Division".
 */
export interface DivisionTitleRecord {
  title?: string | null;
  stage?: string | null;
  head?: string | null;
  question?: string | null;
}
export function divisionTitle(division: DivisionTitleRecord): string {
  return (
    timeLimitedTitle(division) ||
    division.title?.trim() ||
    stageTitle(division.stage) ||
    division.head?.trim() ||
    'Division'
  );
}

/** The qualifier travels with the substantive title on every vote list. */
export function divisionMeta(
  division: DivisionTitleRecord,
  meta: string,
): string {
  return [meta, timeLimitedTitle(division) ? 'under a time limit' : null]
    .filter(Boolean)
    .join(' · ');
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
  const kind = /^[A-Z][A-Za-z ]{0,40}?\s+[-–\u2014]\s+/.exec(text);
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
      .replace(/^\s*[-–\u2014:]\s*/, '')
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

// One table for what counts as a procedural vote (specs/bills.md 4.2.5),
// shared by the bill page, the party page, Votes in parliament and Today.
// Read from the recorded stage; a vote with no recorded stage is never
// procedural.
const PROCEDURAL = [
  /limitation of debate/i,
  /\bclosure\b/i,
  /suspension of standing orders/i,
  /suspend standing orders/i,
  /\badjournment\b/i,
  /\bbusiness motion\b/i,
  /\bdeclaration of urgency\b/i,
  /\burgency motion\b/i,
  /\bmotion to dissent from ruling\b/i,
  /\blet a vote happen\b/i,
];
const THIRD_READING = /third reading/i;
// "Limitation of debate" files every vote taken under the time limit, not
// only the guillotine motion itself: the bill's passage, its readings and
// its amendments are decided under that label too. The question put says
// which. "Amendment" in a bill's own title ("Migration Amendment (…) Bill")
// is not an amendment.
const UNDER_TIME_LIMIT = /limitation of debate/i;
const SUBSTANTIVE_QUESTION = [
  /\b(?:be now|now be) passed\b/i,
  /\b(?:second|third) time\b/i,
  /\bremaining stages\b/i,
  /\bamendments?\b(?!\s*(?:\([^)]*\)\s*)?(?:bill|act)\b)/i,
  /\bstand as printed\b/i,
  // They Vote For You's own title: "<Bill> - Limitation of Debate - <what>".
  /\blimitation of debate\s*[-–]\s*(?![^-–]*\b(?:time|allot))\S/i,
];
const QUESTION_PUT =
  /question (?:now )?(?:before the chair )?is (?:now )?that/gi;
/**
 * The motion actually put: the words after the last "the question is that"
 * in a transcript, or what a summary says the members voted on.
 */
function questionPut(question: string, limit?: number): string {
  const said = [...question.matchAll(QUESTION_PUT)].pop();
  if (said)
    return question.slice(
      said.index + said[0].length,
      said.index + said[0].length + (limit ?? 300),
    );
  const voted = /voted (?:against|in favour of|for) ([\s\S]*)/i.exec(question);
  return voted
    ? voted[1]!.slice(0, limit ?? 200)
    : question.slice(0, limit ?? 300);
}

/**
 * A distinguishing line is the motion, never a transcript's opening patter.
 * Only an explicit question, summary of a motion, or "That" is evidence.
 */
export function divisionMotion(
  question: string | null | undefined,
): string | null {
  const plain = questionPlain(question ?? '');
  let put = questionPut(plain, plain.length).trim();
  const explicit = put !== plain;
  if (!explicit) {
    // A plain motion may carry a leading speaker label from Hansard.
    put = put.replace(/^(?:[\p{Lu}][\p{L}'’\-]+\s+){1,5}(?=That\b)/u, '');
    if (!/^that\b/i.test(put)) return null;
  } else if (
    !plain.match(QUESTION_PUT) &&
    /\bvoted (?:against|in favour of|for)\b/i.test(plain)
  ) {
    const that = /\bthat\s+(.+)/i.exec(put);
    if (!that) return null;
    put = that[1]!;
  }
  put = put.replace(/^that\s+/i, '').trim();
  const end = [...put.matchAll(/[.!?](?=\s|$)/g)].find(
    (mark) =>
      !/\b(?:No|Nos|Dr|Mr|Mrs|Ms|Sen)\.$/i.test(put.slice(0, mark.index + 1)),
  );
  const sentence = (end ? put.slice(0, end.index + 1) : put).trim();
  return sentence ? `That ${sentence.replace(/[.!?]$/, '')}.` : null;
}

/**
 * Sweep 3's display policy lives here so it can be reverted in one place.
 * Reuse the substantive table without changing the procedural rule. An
 * unrecognised question (including a broad TVFY title) keeps its old title.
 */
function timeLimitedTitle(division: DivisionTitleRecord): string | null {
  const stage = String(division.stage ?? division.title ?? '').replace(
    /_/g,
    ' ',
  );
  if (!UNDER_TIME_LIMIT.test(stage) || !division.question) return null;
  const plain = questionPlain(division.question);
  const put = divisionMotion(division.question);
  if (!put) return null;
  const match = SUBSTANTIVE_QUESTION.findIndex((rule) => rule.test(put));
  switch (match) {
    case 0:
      return 'Third reading';
    case 1:
      return /\bthird time\b/i.test(put) ? 'Third reading' : 'Second reading';
    case 2:
      return 'Remaining stages';
    case 3: {
      // Use the motion itself, or the immediately preceding announcement
      // of the amendments' mover, rather than any earlier debate.
      const before = plain
        .slice(0, plain.lastIndexOf(questionPut(plain).trim()))
        .trim();
      const announcement = before
        .split(/[.!?]\s+/)
        .slice(-2)
        .join(' ');
      const greens =
        /\b(?:Australian )?Greens['’]? amendments?\b|\bamendments?[^.!?]{0,120}\b(?:Australian )?Greens\b/i;
      return greens.test(put) || greens.test(announcement)
        ? 'Amendments (Greens)'
        : 'Amendments';
    }
    case 4:
      return 'Clauses as printed';
    default:
      return null;
  }
}

/**
 * True when the vote is a procedural motion: its recorded stage is one, and,
 * for a vote under a time limit, its question is the time limit itself rather
 * than the bill's passage, a reading or an amendment.
 */
export function isProcedural(
  stage: string | null | undefined,
  question?: string | null,
): boolean {
  const s = String(stage ?? '').replace(/_/g, ' ');
  if (!s.trim() || !PROCEDURAL.some((rule) => rule.test(s))) return false;
  if (!UNDER_TIME_LIMIT.test(s) || !question) return true;
  const put = questionPut(question);
  return !SUBSTANTIVE_QUESTION.some((rule) => rule.test(put));
}
/** 1 third reading; 3 procedural; 2 everything else, unknown stages included. */
export function voteTier(
  stage: string | null | undefined,
  question?: string | null,
): 1 | 2 | 3 {
  const s = String(stage ?? '').replace(/_/g, ' ');
  if (THIRD_READING.test(s)) return 1;
  return isProcedural(s, question) ? 3 : 2;
}
/**
 * The page's order: third readings, then the other substantive votes, each
 * newest first; procedural votes apart, newest first.
 */
export function orderDivisions<
  D extends {
    stage?: string | null;
    title?: string | null;
    question?: string | null;
    date: string;
    key: string;
  },
>(divisions: readonly D[]): { main: D[]; procedural: D[] } {
  const tier = (d: D) => voteTier(d.stage ?? d.title ?? null, d.question);
  const newest = (a: D, b: D) =>
    b.date.localeCompare(a.date) || a.key.localeCompare(b.key);
  const main = divisions
    .filter((d) => tier(d) !== 3)
    .sort((a, b) => tier(a) - tier(b) || newest(a, b));
  const procedural = divisions.filter((d) => tier(d) === 3).sort(newest);
  return { main, procedural };
}

/**
 * "Agreed to" or "Not agreed to", never "Negatived". An outcome the record
 * does not name reads from its own counts, as the chamber decides it.
 */
export function outcomeWord(
  outcome: string | null | undefined,
  counts?: { ayes: number; noes: number },
): 'Agreed to' | 'Not agreed to' {
  const o = String(outcome ?? '').toLocaleLowerCase('en-AU');
  if (/^(affirmative|agreed|carried|passed|aye)/.test(o)) return 'Agreed to';
  if (/^(negative|negatived|not|defeated|lost|rejected|no)/.test(o))
    return 'Not agreed to';
  return counts && counts.ayes > counts.noes ? 'Agreed to' : 'Not agreed to';
}

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`;
/**
 * A vote's counts in words. On screen a zero side is left out ("25 noes");
 * spoken, it is said ("no ayes, 25 noes").
 */
export function countWords(
  ayes: number,
  noes: number,
  { spoken = false }: { spoken?: boolean } = {},
): string {
  const aye = ayes ? plural(ayes, 'aye', 'ayes') : spoken ? 'no ayes' : null;
  const no = noes ? plural(noes, 'no', 'noes') : spoken ? 'no noes' : null;
  return [aye, no].filter(Boolean).join(', ') || 'No votes';
}
