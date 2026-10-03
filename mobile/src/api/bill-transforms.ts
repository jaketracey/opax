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
export function billQuestionParts(division: Division, bill: BillDetail) {
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
function billStripTitle(text: string, bill: BillDetail) {
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
