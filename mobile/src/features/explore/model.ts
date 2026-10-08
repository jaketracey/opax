import {
  boolean,
  array,
  count,
  date,
  dict,
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

export const PRACTICE_DATE = '2025-05-03';
export const HOUSE_GUIDE =
  'https://www.aec.gov.au/Voting/How_to_Vote/Voting_HOR.htm';
export const PRACTICE_NOTE =
  'For practice only. This is not a current ballot or an official voting document.';
export const BALLOT_NOTES = [
  'For the federal House, number every box in your chosen order.',
  'These candidates stood on 3 May 2025. The original candidate order came from the AEC’s ballot draw, and does not indicate a recommendation.',
  'Opax does not score or recommend candidates. Parliamentary records can be incomplete and do not establish a candidate’s current views.',
];
const candidate = shape({
  candidate_id: nonempty,
  name: nonempty,
  party: nullable(text),
  ballot_position: count,
});
const ballotDetail = shape({
  electorate_id: nonempty,
  name: nonempty,
  state_code: nonempty,
  jurisdiction: nonempty,
  chamber: nonempty,
  elections: array(
    shape({
      election: shape({ poll_date: date, kind: nonempty }),
      candidates: array(candidate),
      sources: array(nonempty),
    }),
  ),
  sources: dict(shape({ label: nonempty, url: nonempty })),
});
export function decodeBallot(raw: unknown, expectedSeatId?: string) {
  const detail = ballotDetail(raw);
  if (expectedSeatId && detail.electorate_id !== expectedSeatId)
    invalid('The returned ballot does not match this electorate.');
  if (detail.jurisdiction !== 'federal' || detail.chamber !== 'representatives')
    invalid('This practice tool covers the federal House of Representatives.');
  const contests = detail.elections.filter(
    (c) =>
      c.election.poll_date === PRACTICE_DATE && c.election.kind === 'general',
  );
  if (contests.length !== 1)
    invalid(
      'A verified 2025 practice ballot is not available for this electorate.',
    );
  const contest = contests[0]!;
  const candidates = [...contest.candidates].sort(
    (a, b) => a.ballot_position - b.ballot_position,
  );
  if (
    !candidates.length ||
    candidates.some((c, i) => c.ballot_position !== i + 1) ||
    new Set(candidates.map((c) => c.candidate_id)).size !== candidates.length
  )
    invalid(
      'The candidate list could not be verified. Please check the AEC record.',
    );
  const citation = contest.sources
    .map((id) => detail.sources[id])
    .find((s) => {
      try {
        const url = new URL(s?.url ?? '');
        return (
          /candidates/i.test(s?.label ?? '') &&
          url.protocol === 'https:' &&
          url.hostname === 'results.aec.gov.au' &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    });
  if (!citation)
    invalid('The candidate source is not available for this practice ballot.');
  return { ...detail, candidates, citation };
}
export type Ballot = ReturnType<typeof decodeBallot>;
export function validPreferences(
  order: string[],
  candidates: Ballot['candidates'],
  complete = false,
) {
  const allowed = new Set(candidates.map((c) => c.candidate_id));
  return (
    !!candidates.length &&
    allowed.size === candidates.length &&
    new Set(order).size === order.length &&
    order.every((id) => allowed.has(id)) &&
    (!complete || order.length === candidates.length)
  );
}
export function changePreference(
  order: string[],
  candidates: Ballot['candidates'],
  action: 'add' | 'remove' | 'up' | 'down' | 'reset',
  id = '',
) {
  if (!validPreferences(order, candidates))
    throw new Error('Invalid preference order');
  if (action === 'reset') return [];
  if (!candidates.some((c) => c.candidate_id === id))
    throw new Error('Unknown candidate');
  const next = [...order],
    at = next.indexOf(id);
  if (action === 'add' && at < 0) next.push(id);
  if (action === 'remove' && at >= 0) next.splice(at, 1);
  if (action === 'up' || action === 'down') {
    const target = at + (action === 'up' ? -1 : 1);
    if (at >= 0 && target >= 0 && target < next.length)
      [next[at], next[target]] = [next[target]!, next[at]!];
  }
  return next;
}
export function ballotPlan(ballot: Ballot, order: string[]) {
  if (!validPreferences(order, ballot.candidates, true))
    throw new Error(
      'Number every candidate before downloading your practice plan.',
    );
  return [
    'OPAX — 2025 PRACTICE BALLOT',
    'Historical election: 3 May 2025',
    'Federal House of Representatives',
    `${ballot.name}, ${ballot.state_code.toUpperCase()}`,
    '',
    PRACTICE_NOTE,
    'Your preference numbers, beside candidates in the original AEC ballot order:',
    '',
    ...ballot.candidates.map(
      (c) =>
        `${order.indexOf(c.candidate_id) + 1}. ${c.name}${c.party ? ` (${c.party})` : ''}`,
    ),
    '',
    `Candidate source: ${ballot.citation.url}`,
    `How House voting works: ${HOUSE_GUIDE}`,
    '',
    'You chose this order. Opax does not recommend candidates or preferences.',
  ].join('\n');
}
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
    ? `Machine-written from the ${sources.length} passages the knowledge box retrieved for ${data.year} so far, ${cited} of them cited. A reading aid, not the record: check any claim against the speeches.`
    : `Machine-written from what the knowledge box had retrieved for ${data.year} so far. A reading aid, not the record.`;
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
  "A machine pass is still labelling the corpus by subject, so every number here is a floor and shares will settle as it runs. Shares are of each topic's labelled speeches; some speeches carry no party label, so rows need not sum to 100%.";
export const TIDE_NOTE =
  "Each bar is a topic's share of speeches carrying any topic label in that decade for Federal parliament. Each bar opens the speeches behind it. Labels are applied so far; the coverage rule shows how much of the indexed speech record has been reached. Federal is the default because it has the longest comparable run.";
export const WORDS_NOTE =
  'Shown together for comparison. OPAX does not claim one series causes the other. AEC disclosure data: donations under the disclosure threshold are not reported and cannot appear here, so totals are a floor, not a ceiling. The AEC export aggregates party recipients; money to independents is not separated here. A machine pass is still labelling the corpus by subject, so speech counts are floors and shares will settle as it runs. Bars scale within their own panel and series: compare the numbers, not bar lengths, across panels.';
export type Result<T> = RecordResult<T>;
export const identityObject = (raw: unknown) => object(raw);
