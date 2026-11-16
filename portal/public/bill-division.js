// The division that decided a bill, read from the question each division put.
//
// One rule for every place that shows "the vote on the bill": the daily post's vote slide
// (portal/src/daily-post.ts) and the Today question generator (mobile/scripts/today-question.mjs).
// Plain JavaScript with no imports, so the Worker's TypeScript (through bill-division.d.ts) and a
// Node .mjs script both load it as it is.
//
// The rule: the bill's third reading in the second house; failing that, its latest third reading;
// failing that, its latest second reading. Never a vote on how the debate ran (closure, the gag or
// guillotine, suspending standing orders, adjourning, "that the question be now put"), never an
// amendment, and nothing at all when no division put the bill's own reading. A division's name is not
// enough: a closure moved during the third reading is filed under the same name as the third reading
// itself (federal-senate-9971 and 9972), so the question text decides.

/**
 * A division as the bill export (public/bills/<key>.json) or a division file
 * (public/divisions/division-<key>.json) gives it. `stage` comes from the bill export; a division file
 * has only its `name` ("Bills, X Bill 2025; Third Reading", the stage after the last semicolon) and `result`
 * in place of `outcome`.
 * @typedef {{ key?: string, date?: string, house?: string, stage?: string, name?: string, question?: string,
 *   outcome?: string, result?: string, ayes?: number, noes?: number }} BillDivisionRecord
 */
/** @typedef {'third' | 'second'} BillReading */
/** @typedef {'Passed' | 'Agreed' | 'Not agreed'} DivisionOutcomeWord */
/**
 * @template {BillDivisionRecord} [D=BillDivisionRecord]
 * @typedef {{ division: D, reading: BillReading, outcome: DivisionOutcomeWord }} DecidingDivision
 */

/** @param {unknown} text */
const plain = (text) => String(text ?? '')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[*_]+/g, '')
  .replace(/[‘’ʼ`]/g, "'")
  .replace(/[\u2013\u2014]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The question the Chair put, in the Chair's words: the last "the question is that ..." in the text, and what
 * the record says after it (where a closure moved on that question would show).
 * @param {string} text
 * @returns {{ put: string, after: string } | null}
 */
function questionPut(text) {
  /** @type {{ put: string, after: string } | null} */
  let last = null;
  // A bill's "(No. 2)" is not the end of the question.
  for (const m of text.matchAll(/\bquestion (?:now |before the (?:house|senate|chamber) )?is(?: now)?,?(?: that)? ((?:\bNo\.(?=\s*\d)|[^.?!])*)/gi)) {
    // Up to the Chair's result ("Question agreed to.", "Bill read a second time."): later business is not this division.
    const after = text.slice((m.index ?? 0) + m[0].length);
    const end = after.search(/\b(?:question (?:agreed to|negatived|resolved)|bills? read a)\b/i);
    last = { put: m[1], after: end >= 0 ? after.slice(0, end) : after };
  }
  return last;
}

// A vote on how the debate ran, not on the bill.
const PROCEDURAL = new RegExp([
  String.raw`\bquestion be (?:now )?put\b`, String.raw`\bmotion be (?:now )?put\b`, String.raw`\bput the (?:question|motion)\b`,
  String.raw`\bspeed things along\b`, String.raw`\blet (?:a )?vote happen\b`, String.raw`\bend debate\b`,
  String.raw`\blimitation of debate\b`, String.raw`\blimiting debate\b`, String.raw`\btime allotted\b`, String.raw`\ballotment of time\b`,
  String.raw`\bguillotine\b`, String.raw`\bclosure\b`, String.raw`\bgag\b`, String.raw`\badjourn`,
  String.raw`\bsuspen(?:d|ding|sion of)\b[^.]{0,40}\b(?:standing|sessional) orders?\b`, String.raw`\bstanding orders? be suspended\b`,
  String.raw`\bno (?:longer|further) heard\b`, String.raw`\bdissent\b`, String.raw`\bdeclaration of urgency\b`, String.raw`\burgent bill\b`,
  String.raw`\bvote on whether to pass (?:the )?bills? now\b`, String.raw`\bmotion moved by the (?:leader|manager)\b`,
  String.raw`\bstatement of reasons\b`, String.raw`\bduring (?:these|this|the (?:current|present)) (?:sittings?|period of sittings)\b`,
].join('|'), 'i');
// An amendment, or a motion to decline or delay the bill. Lower case only: a bill's own name carries a capital "Amendment".
const AMENDMENT = new RegExp([
  String.raw`\bamendments?\b`, String.raw`\bamend(?:ing)?\b`, String.raw`\bwould have amended\b`,
  String.raw`\bwords proposed to be omitted\b`, String.raw`\ball words after\b`, String.raw`\b(?:add(?:ing)?|omit(?:ting)?) (?:the following |additional |some |these )?words\b`,
  String.raw`\badd(?:s|ed|ing)?\b`, String.raw`\bproviso\b`, String.raw`\b(?:text|words) below\b`,
  String.raw`\bunchanged\b`, String.raw`\b[Dd]eclin(?:e|es|ed|ing) to (?:give|read)\b`, String.raw`\b[Dd]on'?t read\b`,
  String.raw`\b[Dd]on'?t agree with (?:the )?bills?'? main idea\b`, String.raw`\bmain idea\s*\(`, String.raw`\bin committee\b`,
  String.raw`\bwithdrawn\b`, String.raw`\bredrafted\b`, String.raw`\breferred to\b`, String.raw`\breference to\b`, String.raw`\bdeferred\b`,
].join('|'));
const THIRD = new RegExp([
  String.raw`\bread (?:the bills? |this bill |these bills |it |them )?(?:for )?a third time\b`, String.raw`\bbe now passed\b`,
  String.raw`\bremaining stages\b[^.]{0,80}\bbe agreed to\b`, String.raw`\bagree (?:with|to) the remaining stages\b`, String.raw`\bthird reading - pass the bills?\b`,
  String.raw`\bvoted (?:in favour of |to )(?:a motion to )?pass(?:ing)? the (?:amended )?bills?\b`,
].join('|'), 'i');
// Stages that never decide a bill: what a summary says under one of these is about a step on the way.
const NOT_A_READING = /\b(?:in committee|committee of the whole|consideration in detail|consideration of (?:senate|house(?: of representatives)?) messages?|first reading|reference to committee|adoption of report|documents|business motion|committee motion|declaration of urgency)\b/i;
const SECOND = new RegExp([
  String.raw`\bread (?:the bills? |this bill |these bills |it |them )?(?:for )?a second time\b`,
  String.raw`\bagree with (?:the )?bills?'? main idea\b`, String.raw`\bsecond reading - agree with the bills?\b`,
].join('|'), 'i');

/**
 * The stage a division sits under: the export's `stage`, else the last part of a division file's name.
 * @param {BillDivisionRecord} d
 */
function stageOf(d) {
  if (d.stage) return plain(d.stage);
  const name = plain(d.name);
  const at = name.lastIndexOf(';');
  return at >= 0 ? name.slice(at + 1).trim() : '';
}

/**
 * Which reading of the bill a division decided: 'third' when it put the third reading (or, under a
 * guillotine, that the remaining stages be agreed to and the bill be now passed), 'second' when it put the
 * second reading itself, and null for anything else: an amendment, a procedural question, a division with
 * no recorded result, or a record whose text does not say. The question the Chair put decides, whatever
 * stage the record files it under (a guillotined bill's readings sit under "Limitation of debate"); a
 * summary that quotes no question must agree with its stage. A stage name never decides on its own.
 * @param {BillDivisionRecord} d
 * @param {Record<string, string> | null} [proceduralTitles] public/procedural-division-titles.json, if read:
 *   a division listed there is procedural whatever its text says.
 * @returns {BillReading | null}
 */
export function divisionReading(d, proceduralTitles = null) {
  const result = d.outcome ?? d.result;
  if (result !== 'affirmative' && result !== 'negative') return null;
  if (d.key && proceduralTitles && proceduralTitles[d.key]) return null;
  const stage = stageOf(d);
  const all = plain(d.question);
  const chair = questionPut(all);
  if (chair) {
    // A closure or adjournment moved after the question was put is what the division was on.
    if (PROCEDURAL.test(chair.put) || AMENDMENT.test(chair.put) || PROCEDURAL.test(chair.after)) return null;
    return THIRD.test(chair.put) ? 'third' : SECOND.test(chair.put) ? 'second' : null;
  }
  // With no question quoted, a They Vote For You summary says what was voted on in its first sentence (later
  // sentences explain the bill and may mention amendments); a Hansard extract or a division's name is read whole.
  // (No lookbehind: this file is in public/, and Safari before 16.4 cannot parse one; see browser-errors.test.mjs.)
  const text = /^the majority\b/i.test(all) ? (/^[\s\S]*?[.!?]["'”’]?(?=\s*[A-Z(#])/.exec(all)?.[0] ?? all) : all;
  if (!text || NOT_A_READING.test(stage) || PROCEDURAL.test(stage) && !/limitation of debate/i.test(stage)) return null;
  if (PROCEDURAL.test(text) || AMENDMENT.test(text)) return null;
  const third = THIRD.test(text), second = SECOND.test(text);
  if (/third reading/i.test(stage)) return third ? 'third' : null;
  if (/second reading/i.test(stage)) return second ? 'second' : null;
  return third ? 'third' : second ? 'second' : null;
}

/**
 * The outcome in a word, from the division's result: a third reading carried is the bill passing that house.
 * @param {BillDivisionRecord} d
 * @param {BillReading} reading
 * @returns {DivisionOutcomeWord}
 */
export function divisionOutcomeWord(d, reading) {
  const agreed = (d.outcome ?? d.result) === 'affirmative';
  return reading === 'third' && agreed ? 'Passed' : agreed ? 'Agreed' : 'Not agreed';
}

/** @param {BillDivisionRecord} d */
const order = (d) => `${d.date ?? ''}#${String(/(\d+)$/.exec(d.key ?? '')?.[1] ?? '').padStart(8, '0')}`;

/**
 * The division that decided the bill: its third reading in the second house (the house it was not
 * introduced in), else its latest third reading, else its latest second reading; null when no division put
 * either reading. Never falls back to the latest division of any kind.
 * @template {BillDivisionRecord} D
 * @param {D[]} divisions
 * @param {{ proceduralTitles?: Record<string, string> | null, originatingHouse?: string | null }} [options]
 * @returns {DecidingDivision<D> | null}
 */
export function decidingDivision(divisions, options = {}) {
  const { proceduralTitles = null, originatingHouse = null } = options;
  /** @type {{ division: D, reading: BillReading }[]} */
  const read = [];
  for (const division of divisions ?? []) {
    const reading = divisionReading(division, proceduralTitles);
    if (reading) read.push({ division, reading });
  }
  /** @param {(r: { division: D, reading: BillReading }) => boolean} keep */
  const latest = (keep) => read.filter(keep).sort((a, b) => order(b.division).localeCompare(order(a.division)))[0];
  const found = (originatingHouse ? latest(r => r.reading === 'third' && !!r.division.house && r.division.house !== originatingHouse) : undefined)
    ?? latest(r => r.reading === 'third') ?? latest(r => r.reading === 'second');
  return found ? { ...found, outcome: divisionOutcomeWord(found.division, found.reading) } : null;
}
