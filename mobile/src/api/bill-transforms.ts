// Pure bill display transforms ported from portal/public/app.js.
// Original-source parity is checked by tests/transforms.test.ts.
import type { BillDetail } from './catalog-decoders';
function titleCaseName(surname: string) {
  return String(surname || '')
    .toLocaleLowerCase('en-AU')
    .replace(
      /(^|[\s'’-])(\p{Ll})/gu,
      (_, sep: string, c: string) => sep + c.toLocaleUpperCase('en-AU'),
    )
    .replace(
      /\bMc(\p{Ll})/gu,
      (_, c: string) => `Mc${c.toLocaleUpperCase('en-AU')}`,
    );
}
const BILL_MEMBER =
  /([\p{Lu}][\p{Lu}'’\- ]*[\p{Lu}]),\s*([^,]+?),\s*(MP|Senator|Sen\.?)(?=\p{Lu}|$)/gu;
export function billSponsorFromPortfolio(portfolio: string | null) {
  const raw = String(portfolio || '').trim();
  if (!/^\(s\)\s*/i.test(raw)) return null;
  const rest = raw.replace(/^\(s\)\s*/i, '').trim();
  const found = [...rest.matchAll(BILL_MEMBER)].map((m) => ({
    name: `${m[2]!.trim()} ${titleCaseName(m[1]!)}`,
    suffix: m[3]!.trim(),
  }));
  return found.length ? found : [{ name: rest, suffix: '' }];
}
export const billPortfolio = (b: { portfolio: string | null }) =>
  billSponsorFromPortfolio(b?.portfolio) ? '' : String(b?.portfolio || '');
export function billSponsorName(raw: string | null) {
  const s = String(raw || '')
    .replace(/&#39;/g, "'")
    .replace(/&#34;|&quot;/g, '"')
    .trim();
  const m = s.match(/^([A-Za-z][A-Za-z'\- ]+),\s*(.+)$/);
  if (!m) return s;
  const surname = m[1]!
    .toLowerCase()
    .replace(
      /(^|[\s'\-])([a-z])/g,
      (_, a: string, b: string) => a + b.toUpperCase(),
    )
    .replace(/^Mc([a-z])/, (_, c: string) => 'Mc' + c.toUpperCase());
  const given = m[2]!
    .replace(
      /\b(the Hon|Hon|Sen|Senator|Dr|Mr|Mrs|Ms|Miss|MP|AM|AO|OAM|QC|SC)\b\.?/g,
      '',
    )
    .replace(/[,\s]+/g, ' ')
    .trim();
  return given ? `${given} ${surname}` : surname;
}
export function billPartyName(raw: string | null) {
  const s = String(raw || '')
    .replace(/&#39;/g, "'")
    .replace(/&#34;|&quot;/g, '')
    .trim();
  const k = s.toLowerCase();
  if (!k || /independent/.test(k)) return k ? 'Independent' : '';
  if (/liberal national party/.test(k)) return 'LNP';
  if (/country liberal/.test(k)) return 'Country Liberal Party';
  if (/liberal democrat/.test(k)) return 'Liberal Democrats';
  if (/^liberal|liberal party/.test(k)) return 'Liberal';
  if (/labor|^alp$/.test(k)) return 'Labor';
  if (/national/.test(k)) return 'Nationals';
  if (/green/.test(k)) return 'Greens';
  if (/one nation/.test(k)) return 'One Nation';
  if (/centre alliance|nick xenophon/.test(k)) return 'Centre Alliance';
  if (/katter/.test(k)) return "Katter's Australian Party";
  if (/united australia|palmer/.test(k)) return 'United Australia Party';
  if (/lambie/.test(k)) return 'JLN';
  if (/family first/.test(k)) return 'Family First';
  if (/democrats/.test(k)) return 'Australian Democrats';
  return s;
}
// The web's bill-source labels, with a readable fallback for new register kinds.
const sourceNames: Record<string, string> = {
  billhome: 'Bill home',
  text: 'Bill text',
  em: 'Explanatory memorandum',
  exposure_draft: 'Exposure draft',
  consultation: 'Consultation page',
  em_revised: 'Revised explanatory memorandum',
  em_supp: 'Supplementary explanatory memorandum',
  digest: 'Bills Digest',
  frl_act: 'The Act on the Federal Register',
};
export const billSourceLabel = (kind: string) =>
  Object.hasOwn(sourceNames, kind)
    ? sourceNames[kind]!
    : kind.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export function billDisplay<
  T extends {
    portfolio: string | null;
    sponsor: string | null;
    sponsor_party: string | null;
    status: string;
  },
>(bill: T) {
  const members = billSponsorFromPortfolio(bill.portfolio);
  return {
    ...bill,
    sponsor: bill.sponsor
      ? billSponsorName(bill.sponsor)
      : members?.map((m) => m.name).join(', ') || null,
    sponsorMembers: bill.sponsor
      ? [{ name: billSponsorName(bill.sponsor), suffix: '' }]
      : (members ?? []),
    sponsor_party: billPartyName(bill.sponsor_party) || null,
    portfolio: billPortfolio(bill) || null,
    introducedLabel:
      bill.status === 'exposure_draft' ? 'Released' : 'Introduced',
  };
}
type Division = BillDetail['divisions'][number];
const BILL_DESCRIPTION =
  /^(this (is|division|motion|amendment)\b|the (majority|motion) )/i;
const BILL_PLACEHOLDER =
  /^(long debate text truncated|text truncated|no text recorded)\.?$/i;
const BILL_MD_LINK = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const billPlain = (t: string) =>
  String(t).replace(/[*_]{1,3}(?=\S)([^*_]+?)(?<=\S)[*_]{1,3}/g, '$1');
const billFlat = (t: string) =>
  billPlain(String(t || '').replace(BILL_MD_LINK, '$1')).trim();
function billNoteRepair(text: string) {
  return (
    String(text || '')
      // Emphasis wrapped around a whole link leaves one mark on each side of it,
      // and neither has a partner once the link becomes a link: "_For
      // privatising government assets_" arrived as "the Policy _For … assets _.".
      .replace(/([*_]{1,3})(\[[^\]]+\]\([^)\s]+\))\1/g, '$2')
      .replace(/([^\s(\]])\(/g, '$1 (')
      .replace(/\s+([.,;:])/g, '$1')
      .replace(/\s+\)/g, ')')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
function billStripStage(text: string, stage: string | null) {
  const s = String(stage || '').trim();
  const out = String(text || '').trim();
  if (!s || !out.toLowerCase().startsWith(s.toLowerCase())) return out;
  const rest = out
    .slice(s.length)
    .replace(/^\s*[-–—:]\s*/, '')
    .trim();
  // Only when something is left: a division named by its stage alone keeps it.
  return rest || out;
}
export function billQuestionParts(
  division: Division,
  bill: Pick<BillDetail, 'title' | 'short_title'>,
) {
  const raw = billStripStage(
    billStripTitle(billNoteRepair(division?.question), bill),
    division?.stage,
  );
  const plain = billFlat(raw);
  // "Long debate text truncated." is the source saying it has nothing, not a
  // motion: a row carrying only that placeholder is named by its stage and date.
  if (!plain || BILL_PLACEHOLDER.test(plain)) return { head: '', note: '' };
  if (BILL_DESCRIPTION.test(plain)) return { head: '', note: raw };
  if (plain.length <= 110) return { head: plain, note: '' };
  // The first sentence stands as the heading, measured in words a reader sees
  // rather than in a URL's characters; the rest is the note it is.
  for (const m of raw.matchAll(/[.?!](\s|$)/g)) {
    const head = billFlat(raw.slice(0, m.index + 1));
    if (head.length < 20) continue;
    if (head.length > 160) break;
    return { head, note: raw.slice(m.index + 1).trim() };
  }
  return { head: `${plain.slice(0, 105).trimEnd()}…`, note: raw };
}
export function billDedupeDivisions(divisions: Division[], bill: BillDetail) {
  const groups = new Map<string, Division[]>();
  for (const d of divisions || []) {
    const k = [
      d.date,
      String(d.stage || '').toLowerCase(),
      d.ayes,
      d.noes,
    ].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }
  const kept: Division[] = [];
  let collapsed = 0;
  for (const group of groups.values()) {
    // Prefer a row whose question is the motion; then one that has a question at all.
    const best =
      group.find((d) => billQuestionParts(d, bill).head) ||
      group.find((d) => d.question) ||
      group[0]!;
    kept.push(best);
    collapsed += group.length - 1;
  }
  kept.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return { divisions: kept, collapsed };
}
function billStripTitle(
  text: string,
  bill: Pick<BillDetail, 'title' | 'short_title'>,
) {
  let out = String(text || '').trim();
  for (const t of [bill?.title, bill?.short_title]) {
    const title = String(t || '').trim();
    if (title && out.toLowerCase().startsWith(title.toLowerCase())) {
      out = out
        .slice(title.length)
        .replace(/^\s*[-–—:]\s*/, '')
        .trim();
    }
  }
  return out;
}

// List search, labels, stage runs and party splits, ported from the web's
// bill pages (portal/public/app.js). Parity: tests/bills.test.ts.

/** The web's foldText: what directory search compares, term by term. */
export function billFoldText(s: string | null | undefined) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
/** A register token in English: "before_parliament" is "Before parliament". */
export function billSentenceCase(s: string | null | undefined) {
  const t = String(s || '')
    .replace(/_/g, ' ')
    .trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : '';
}
/** A stage as the register wrote it; a parsed-out compound title is clipped. */
export function billStage(stage: string | null | undefined) {
  const t = billSentenceCase(stage);
  return t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t;
}
/** The short title when the register carries one, else the title itself. */
export const billName = (b: {
  short_title?: string | null;
  title?: string | null;
  key?: string | null;
}) => b.short_title || b.title || b.key || '';
// The register's own codes for who is not a party.
const BILL_PARTY_LABELS: Record<string, string> = {
  PRES: 'Presiding officer',
  SPK: 'Speaker',
  '': 'Not recorded',
};
/** A party-split key as the web labels it. */
export const billParty = (p: string | null | undefined) =>
  BILL_PARTY_LABELS[String(p || '').trim()] || billPartyName(p ?? null);
/** A division note as plain words: link text kept, URLs and emphasis dropped. */
export const billNoteText = (note: string) => billFlat(billNoteRepair(note));
// Relative links in They Vote For You's notes are its own pages.
const BILL_NOTE_BASE = 'https://theyvoteforyou.org.au';
export interface BillNoteLink {
  /** The link text as the note reads it ("bills digest"). */
  label: string;
  /** The destination, relative links resolved against They Vote For You. */
  url: string;
}
/**
 * The record's own citations in a division note, in order, exactly where the
 * web's billNoteHTML makes a link: http(s) destinations only, everything else
 * stays words. Callers still pass each through the app's source-link policy.
 */
export function billNoteLinks(note: string): BillNoteLink[] {
  const links: BillNoteLink[] = [];
  for (const m of billNoteRepair(note).matchAll(BILL_MD_LINK)) {
    const url = m[2]!.startsWith('/') ? BILL_NOTE_BASE + m[2] : m[2]!;
    if (/^https?:\/\//i.test(url)) links.push({ label: billPlain(m[1]!), url });
  }
  return links;
}

export interface BillStageRun<D> {
  /** The stage as the register wrote it, in English ("Second reading"). */
  stage: string;
  /** The register's chamber code, or null. */
  house: string | null;
  dates: D[];
}
/**
 * The register records a stage on every day it was before a house; a run of
 * one stage in one chamber is one entry carrying its span (web billStageRuns).
 * Dates are sorted first, as the web's timeline does.
 */
export function billStageRuns<
  D extends { stage: string; date: string; house: string | null },
>(keyDates: readonly D[]): BillStageRun<D>[] {
  const dates = keyDates
    .filter((d) => d?.date)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const runs: BillStageRun<D>[] = [];
  for (const d of dates) {
    const stage = billStage(d.stage) || 'Stage not named';
    const house = d.house ? d.house.toLowerCase() : null;
    const last = runs[runs.length - 1];
    if (last && last.stage === stage && last.house === house) {
      last.dates.push(d);
      continue;
    }
    runs.push({ stage, house, dates: [d] });
  }
  return runs;
}

export interface BillSplit {
  /** The split's key as recorded ("Labor", "PRES", ""). */
  party: string;
  /** The web's label for it ("Labor", "Presiding officer", "Not recorded"). */
  label: string;
  ayes: number;
  noes: number;
}
// The parties that decide a division are drawn; the one- and two-member
// remainder is named on one line, in full (web BILL_SPLIT_DRAWN/SMALL).
const BILL_SPLIT_DRAWN = 5;
const BILL_SPLIT_SMALL = 2;
/**
 * A division's party splits as the web's bill page lays them out: largest
 * first, small parties folded onto one line, and the notes on what the
 * attribution rests on (web billSplitHTML, without the markup).
 */
export function billSplits(division: Division) {
  const splits: BillSplit[] = Object.entries(division.party_splits || {})
    .map(([party, v]) => ({
      party,
      label: billParty(party),
      ayes: Number(v?.ayes) || 0,
      noes: Number(v?.noes) || 0,
    }))
    .filter((s) => s.ayes || s.noes)
    .sort(
      (a, b) =>
        b.ayes + b.noes - (a.ayes + a.noes) || a.party.localeCompare(b.party),
    );
  let drawn = splits.filter(
    (s, i) => i < BILL_SPLIT_DRAWN || s.ayes + s.noes > BILL_SPLIT_SMALL,
  );
  let folded = splits.slice(drawn.length);
  // One line saved is no saving.
  if (folded.length === 1) {
    drawn = splits;
    folded = [];
  }
  const max = Math.max(...drawn.map((s) => Math.max(s.ayes, s.noes)), 1);
  const named = splits.reduce((a, s) => a + s.ayes + s.noes, 0);
  const total = (Number(division.ayes) || 0) + (Number(division.noes) || 0);
  const cov = (division.party_coverage || {}) as Record<string, number>;
  const weak =
    (Number(cov.member) || 0) +
    (Number(cov.earliest) || 0) +
    (Number(cov.unknown) || 0);
  const dated = Number(cov.dated) || 0;
  const notes = [
    total && named && named < total
      ? `${total - named} not placed with a party`
      : '',
    weak > 0 && dated + weak > 0
      ? `${weak} of ${dated + weak} inferred, not observed on the day`
      : '',
    Number(division.paired) > 0 ? `${division.paired} paired` : '',
  ].filter(Boolean);
  return { drawn, folded, max, notes, recorded: splits.length > 0 };
}

export interface BillTimelineStage {
  stage: string;
  /** The register's chamber code; null when the stage names no chamber. */
  house: string | null;
  /** Distinct sitting days the stage ran across. */
  days: number;
}
export interface BillTimelineEntry {
  from: string;
  /** The last day of a span; null for a single day. */
  to: string | null;
  stages: BillTimelineStage[];
}
/**
 * The bill's stages as dated entries: the web's stage runs, with runs that
 * share the same day (or the same span) under one date, so a bill that went
 * through every stage in one day shows that day once.
 */
export function billTimeline(
  keyDates: readonly { stage: string; date: string; house: string | null }[],
) {
  const runs = billStageRuns(keyDates);
  const entries: BillTimelineEntry[] = [];
  for (const run of runs) {
    const from = run.dates[0]!.date;
    const last = run.dates[run.dates.length - 1]!.date;
    const to = last === from ? null : last;
    const stage = {
      stage: run.stage,
      // "Royal assent · Assent": a stage that names its chamber says it once.
      house:
        run.house && !run.stage.toLowerCase().includes(run.house)
          ? run.house
          : null,
      days: new Set(run.dates.map((d) => d.date)).size,
    };
    const previous = entries[entries.length - 1];
    if (previous && previous.from === from && previous.to === to)
      previous.stages.push(stage);
    else entries.push({ from, to, stages: [stage] });
  }
  const dates = runs.reduce((n, r) => n + r.dates.length, 0);
  return {
    entries,
    /** Register rows folded into runs (the web's fold note). */
    folded: dates - runs.length,
    runs: runs.length,
    dates,
    /** Every recorded stage fell on one day. */
    oneDay: entries.length === 1 && entries[0]!.to === null,
  };
}
