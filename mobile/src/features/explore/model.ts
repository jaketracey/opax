import {
  boolean,
  array,
  count,
  date,
  invalid,
  nonempty,
  nullable,
  object,
  optional,
  shape,
  text,
} from '../../api/validation';
import type { RecordResult } from '../../api/client';
import { decodeIndustryMoney, decodeMatrix } from '../reports/model';

const yearSource = shape({
  slug: nonempty,
  title: optional(text),
  speaker: nullable(text),
  party: nullable(text),
  state: nullable(text),
  date: nullable(date),
  cited: optional(boolean),
});
export const decodeYear = (raw: unknown, expectedYear?: number) => {
  const data = shape({
    year: count,
    generated_at: date,
    brief: shape({ answer: nonempty, sources: array(yearSource) }),
    voices: shape({
      unique_speeches: count,
      unlabelled_party: count,
      presiding_rows_skipped: optional(count),
      probes: array(shape({ q: nonempty, label: nonempty })),
      speakers: array(
        shape({ name: nonempty, party: nullable(text), speeches: count }),
      ),
      parties: array(shape({ party: nonempty, speeches: count })),
    }),
  })(raw);
  if (data.year < 1998 || data.year > 2026) invalid();
  if (expectedYear !== undefined && data.year !== expectedYear)
    invalid('The returned brief does not match this year.');
  return data;
};
export type Year = ReturnType<typeof decodeYear>;
/** The web's phone opening: whole sentences, with all remaining words behind a tap. */
export function yearOpening(answer: string) {
  const paragraphs = answer
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .replace(/\*\*/g, '')
        .replace(/^\s*(#+|[-*•])\s+/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  const first = paragraphs[0] ?? '';
  let end = -1;
  if (first.length > 460) {
    const sentence = /[.!?]["’”')\]]*(?=\s|$)/g;
    let match: RegExpExecArray | null;
    while ((match = sentence.exec(first.slice(0, 401))))
      if (match.index + match[0].length >= 160)
        end = match.index + match[0].length;
  }
  return end > 0 && end < first.length
    ? {
        lead: first.slice(0, end),
        rest: [first.slice(end).trim(), ...paragraphs.slice(1)],
      }
    : { lead: first, rest: paragraphs.slice(1) };
}
export function yearMachineNote(data: Year) {
  const sources = data.brief.sources,
    cited = sources.filter((s) => s.cited).length;
  return sources.length
    ? `Machine-written from ${sources.length} passages found for ${data.year}, ${cited} of them cited. A reading aid, not the record: check any claim against the speeches.`
    : `Machine-written from the passages found for ${data.year}. A reading aid, not the record.`;
}
export function voicesNote(data: Year) {
  const v = data.voices,
    total = v.unique_speeches,
    labelled = total - v.unlabelled_party;
  return `Speeches per speaker among the ${total.toLocaleString('en-AU')} strongest matches for ${data.year}’s ${v.probes.length || 4} debates, so far.${total && labelled < total ? ` Party labels exist for ${labelled.toLocaleString('en-AU')} of them.` : ''}${v.presiding_rows_skipped ? ' Rows the record attributes to the presiding officers are left out.' : ''} Who dominates those debates in the index, not who spoke most in parliament.`;
}
export const pairings = [
  { topic: 'gambling', industries: ['gambling'], money: 'Gambling' },
  { topic: 'financial-services', industries: ['finance'], money: 'Finance' },
  {
    topic: 'mining-energy',
    industries: ['mining', 'fossil_fuels'],
    money: 'Mining and fossil-fuel',
  },
  {
    topic: 'property-construction',
    industries: ['property'],
    money: 'Property and construction',
  },
  { topic: 'media-communications', industries: ['media'], money: 'Media' },
  {
    topic: 'hospitality-alcohol',
    industries: ['hospitality', 'alcohol'],
    money: 'Hospitality and alcohol',
  },
  { topic: 'agriculture', industries: ['agriculture'], money: 'Agriculture' },
  { topic: 'unions-workplace', industries: ['unions'], money: 'Union' },
];
export function wordsPanel(
  pairing: (typeof pairings)[number],
  matrix: ReturnType<typeof decodeMatrix>,
  money: ReturnType<typeof decodeIndustryMoney>,
) {
  const donors = money.nodes.filter(
    (n) => n.kind === 'donor' && pairing.industries.includes(n.industry ?? ''),
  );
  const ids = new Set(donors.map((n) => n.id)),
    amounts = new Map<string, number>();
  for (const e of money.edges)
    if (ids.has(e.source)) {
      const party = e.target.replace(/^party:/, '');
      amounts.set(party, (amounts.get(party) ?? 0) + e.total);
    }
  const cells = matrix.cells[pairing.topic] ?? {},
    total = matrix.totals[pairing.topic] ?? 0;
  return {
    total,
    moneyTotal: [...amounts.values()].reduce((a, b) => a + b, 0),
    rows: [
      ...new Set([
        ...amounts.keys(),
        ...Object.keys(cells).filter((p) => p !== 'Other'),
      ]),
    ]
      .sort(
        (a, b) =>
          (amounts.get(b) ?? 0) - (amounts.get(a) ?? 0) ||
          (cells[b] ?? 0) - (cells[a] ?? 0) ||
          a.localeCompare(b),
      )
      .map((party) => ({
        party,
        money: amounts.get(party) ?? 0,
        speeches: cells[party] ?? 0,
        speechKnown: matrix.parties.includes(party),
      })),
  };
}
export const MATRIX_NOTE =
  "Not every speech has a topic label yet, so every number here is a floor and shares may shift. Shares are of each topic's labelled speeches; some speeches carry no party label, so rows need not sum to 100%.";
export const TIDE_NOTE =
  "Each bar is a topic's share of speeches carrying any topic label in that decade for Federal parliament. Each bar opens the speeches behind it. Not every speech is labelled yet; the coverage rule shows how many are. Federal is the default because it has the longest comparable run.";
export const WORDS_NOTE =
  'Shown together for comparison. OPAX does not claim one series causes the other. AEC disclosure data: donations under the disclosure threshold are not reported and cannot appear here, so totals are a floor, not a ceiling. AEC data groups party recipients; money to independents is not separated here. Not every speech has a topic label yet, so speech counts are floors and shares may shift. Bars scale within their own panel and series: compare the numbers, not bar lengths, across panels.';
export type Result<T> = RecordResult<T>;
export const identityObject = (raw: unknown) => object(raw);
