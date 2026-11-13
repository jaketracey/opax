import type { Href } from 'expo-router';
import type { SourceOriginal } from '../../design/source';
import type { MoneyGraph } from '../money/data';
import { donorNodeFor, loadedMoneyGraph } from '../money/lookup';
import { askRoute } from '../../navigation/routes/ask';
import { moneyRoute } from '../../navigation/routes/money-map';
import { partyRoute } from '../../navigation/routes/people';
import { moneyRecordRoute } from '../../navigation/routes/public-money';
import { methodsRoute } from '../../navigation/routes/reference';
import { topicRoute } from '../../navigation/routes/search';
import type { Question } from './quiz-model';

/** A quiz link as an in-app web path; every donor's record opens, as on the web. */
export function quizRecordPath(href: string): string {
  return href.replace(/^#/, '').replace(/^\/search\?/, '/ask?view=search&');
}

type AskScope = Parameters<typeof askRoute>[0];
/**
 * Where a question's link goes, always inside OPAX:
 * - `original`: the record row in the reveal's source sheet. Its `url` is the
 *   web path the sheet resolves natively (`fromWebPath`), and `route` is the
 *   same destination from its group's route builder: a donor's money record,
 *   the in-tab money map filtered to an industry, a party or topic page, or
 *   Methods ("How OPAX is built").
 *   A donor round names its donor; the record opens by the donor's graph id,
 *   as the money page's "Largest donors" rows do, so the name is matched on
 *   the federal money graph (`donorNodeFor`, the map search's normalised
 *   names, exact only). Before the graph loads, or with no match, there is
 *   no row.
 * - `ask`: a speaker's year in the record, drafted in Ask through
 *   `useOpenAsk` and never sent.
 * Null means no row: a link with no native page.
 */
export type QuizDestination =
  | { kind: 'original'; original: SourceOriginal; route: () => Href }
  | { kind: 'ask'; label: string; draft: AskScope };

const decode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
};
/** "Read the Climate & Energy report" names "Climate and Energy". */
function topicName(q: Question): string | null {
  const name = /^Read the (.+) report$/.exec(q.link.label)?.[1];
  return name ? name.replace(/\s*&\s*/g, ' and ') : null;
}
const industryName = (slug: string) => {
  const words = slug.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Whether a question links to a donor, so its reveal needs the money graph. */
export const isDonorQuestion = (q: Question) =>
  /^\/subject\/donor\//.test(quizRecordPath(q.link.href));

export function quizDestination(
  q: Question,
  graph: MoneyGraph | null = loadedMoneyGraph('federal'),
): QuizDestination | null {
  const path = quizRecordPath(q.link.href);
  if (!path) return null;
  const url = new URL(path, 'https://opax.invalid');
  const segments = /^\/subject\/(donor|party|topic)\/([^/]+)\/?$/.exec(
    url.pathname,
  );
  if (segments) {
    const [, kind, raw] = segments;
    const name = decode(raw!);
    if (!name) return null;
    if (kind === 'donor') {
      const donor = donorNodeFor({ name }, graph);
      if (!donor) return null;
      return {
        kind: 'original',
        original: {
          label: donor.label,
          url: `/money?node=${encodeURIComponent(donor.id)}`,
          record: 'donations',
        },
        route: () => moneyRecordRoute({ node: donor.id }, donor.label),
      };
    }
    if (kind === 'party')
      return {
        kind: 'original',
        original: { label: name, url: path, record: 'party page' },
        route: () => partyRoute(name),
      };
    const label = topicName(q) ?? name;
    return {
      kind: 'original',
      original: { label, url: path, record: 'topic page' },
      route: () => topicRoute(name, {}, label),
    };
  }
  if (url.pathname === '/methods')
    return {
      kind: 'original',
      original: { label: 'How OPAX is built', url: '/methods' },
      route: () => methodsRoute,
    };
  if (url.pathname === '/money' && url.searchParams.get('industry')) {
    const industry = url.searchParams.get('industry')!;
    return {
      kind: 'original',
      original: {
        label: industryName(industry),
        url: `/money?industry=${encodeURIComponent(industry)}`,
        record: 'money map',
      },
      route: () => {
        const base = moneyRoute();
        return {
          pathname: base.pathname,
          params: { ...base.params, industry },
        };
      },
    };
  }
  if (url.pathname === '/ask' && url.searchParams.get('speaker')) {
    const speaker = url.searchParams.get('speaker')!;
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? from;
    const year = from && from === to ? from : '';
    return {
      kind: 'ask',
      label: `Ask about ${speaker}${year ? ` in ${year}` : ''}`,
      draft: {
        question: year
          ? `What did ${speaker} say in parliament in ${year}?`
          : `What has ${speaker} said in parliament?`,
        speaker,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
    };
  }
  return null;
}
