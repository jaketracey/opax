import type { Href } from 'expo-router';
import type { EditionView } from '../../api/selectors';
import type { DateInput } from '../../design/format';
import type { SFSymbol } from '../../design/icon';
import type { SourceDetails, SourceOriginal } from '../../design/source';
import { symbols } from '../../design/symbols';
import type { Accent } from '../../design/tokens';
import { billRoute } from '../../navigation/routes/bills';
import { moneyRoute } from '../../navigation/routes/money-map';
import { personRoute } from '../../navigation/routes/people';
import {
  grantProgramRoute,
  largestGrantsRoute,
  moneyItemRoute,
  moneyRecordRoute,
} from '../../navigation/routes/public-money';
import { topicRoute } from '../../navigation/routes/search';
import { topics } from '../search/contracts';

export const EDITION_RULE =
  'Rotates by weekday from the public record: Sunday a bill, Monday a grant program, Tuesday a parliamentarian, Wednesday a grant, Thursday a bill, Friday the largest grants, Saturday a topic. Editions up to 3 days old appear at the top; up to 14 days old, lower on the page; older editions are not shown here.';

export type EditionTier = 'fresh' | 'recent' | 'old';
const sydneyDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
export function editionTier(
  date: string,
  today: Date | string = new Date(),
): EditionTier {
  const parts = typeof today === 'string' ? null : sydneyDay(today);
  const day =
    typeof today === 'string'
      ? today
      : ['year', 'month', 'day']
          .map((type) => parts!.find((p) => p.type === type)!.value)
          .join('-');
  const age = Math.floor((Date.parse(day) - Date.parse(date)) / 86_400_000);
  return age <= 3 ? 'fresh' : age <= 14 ? 'recent' : 'old';
}

export const editionInk = (edition: EditionView): Accent =>
  edition.kind === 'bill'
    ? 'bills'
    : edition.kind === 'politician'
      ? 'people'
      : ['program', 'grant', 'largest'].includes(edition.kind)
        ? 'money'
        : 'votes';
export const editionSymbol = (edition: EditionView): SFSymbol =>
  edition.kind === 'bill'
    ? 'doc.text'
    : edition.kind === 'politician'
      ? 'person.crop.circle'
      : edition.kind === 'topic'
        ? 'number'
        : symbols.money;

export function editionTopic(edition: EditionView) {
  const slug = /^\/(?:topic|reports)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(
    new URL(edition.path, 'https://opax.invalid').pathname,
  )?.[1];
  return slug && Object.hasOwn(topics, slug)
    ? { slug, name: topics[slug as keyof typeof topics] }
    : null;
}

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
/**
 * The plate's detail line, less any sentence already shown below it. The
 * cover line often restates the first paragraph ("This bill would … Passed
 * 18 Sep 2026."), so the page, which shows every paragraph, draws no line,
 * and the card, which shows the first, keeps only what the paragraph lacks.
 */
export function plateLine(
  line: string | null,
  shownBelow?: readonly string[],
): string | null {
  if (!line?.trim()) return null;
  if (!shownBelow?.length) return line;
  const below = new Set(shownBelow.flatMap(sentences));
  const rest = sentences(line).filter((sentence) => !below.has(sentence));
  return rest.length ? rest.join(' ') : null;
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];
/** A timeline date as published ("12 Aug 2026", "12 August 2026") to ISO. */
export function eventDay(date: string): string | null {
  const match = /^(\d{1,2})\s+([a-z]{3,9})\.?\s+(\d{4})$/i.exec(date.trim());
  if (!match)
    return /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim() : null;
  const month = MONTHS.indexOf(match[2]!.slice(0, 3).toLowerCase());
  if (month < 0) return null;
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
}

/**
 * What the page's timeline caption covers: the first recorded stage to the
 * latest, not the edition's own day (which made "4 October 2026 to 4
 * October 2026"). The source is left to the page's one SourceLine below, so
 * the caption is the date range alone.
 */
export function timelineProvenance(
  edition: Pick<EditionView, 'date' | 'facts'>,
) {
  const days = edition.facts.events
    .map((event) => eventDay(event.date))
    .filter((day): day is string => !!day)
    .sort();
  return {
    dateRange: {
      start: days[0] ?? edition.date,
      end: days.at(-1) ?? edition.date,
    },
    citation: '',
  };
}

export function editionPerson(edition: EditionView) {
  const first = edition.facts.line?.split(' · ')[0]?.trim();
  const party =
    first && !/^(?:House of Representatives|Senate|records\b)/i.test(first)
      ? first
      : null;
  const place = edition.facts.kicker?.split(' · ').slice(1).join(' · ') || null;
  return { party, place };
}

/** Only native subjects. An obsolete report path never becomes a web fallback. */
export function editionSubject(
  edition: EditionView,
  personSlug?: string,
): Href | null {
  const u = new URL(edition.path, 'https://opax.invalid');
  const p = u.searchParams;
  const bill = /^\/bill\/([^/]+)\/?$/.exec(u.pathname);
  if (edition.kind === 'bill' && bill?.[1]) return billRoute(bill[1]);
  if (edition.kind === 'politician')
    return personSlug ? personRoute(personSlug) : null;
  if (edition.kind === 'topic') {
    const topic = editionTopic(edition);
    return topic ? topicRoute(topic.slug, {}, topic.name) : null;
  }
  if (u.pathname === '/money/grants' || u.pathname === '/money/grants/') {
    const jur = p.get('jur') ?? 'federal';
    if (p.get('program'))
      return grantProgramRoute(p.get('program')!, jur, edition.title);
    if (p.get('largest')) return largestGrantsRoute(p.get('largest')!);
    if (p.get('open'))
      return moneyItemRoute(
        { kind: 'grant', id: p.get('open')!, jur },
        edition.title,
      );
  }
  const recipient = /^\/money\/grants\/([^/]+)\/recipient\/([^/]+)\/?$/.exec(
    u.pathname,
  );
  if (recipient?.[1] && recipient[2]) {
    const rid = decodeURIComponent(recipient[2]);
    const award = p.get('award');
    // The award, rather than its recipient's aggregate, is Wednesday's subject.
    return award
      ? moneyItemRoute(
          { kind: 'grant', id: award, award, rid, jur: recipient[1] },
          edition.title,
        )
      : moneyRecordRoute({ rid, jur: recipient[1] }, edition.title);
  }
  if (u.pathname === '/money') {
    if (p.get('rid') || p.get('node'))
      return moneyRecordRoute(Object.fromEntries(p), edition.title);
    return moneyRoute(p.get('party'), p.get('jur') ?? 'federal', edition.title);
  }
  return null;
}

export function editionQuestion(edition: EditionView): string {
  const title = edition.shortTitle ?? edition.title;
  if (edition.kind === 'bill')
    return `What did parliament say about the ${title}?`;
  if (edition.kind === 'politician')
    return `What has ${title} said in parliament this year?`;
  if (edition.kind === 'topic')
    return `What has parliament said about ${editionTopic(edition)?.name ?? title} this year?`;
  if (edition.kind === 'largest')
    return 'What has parliament said about government grants this year?';
  if (edition.kind === 'grant') {
    // A program must be labelled explicitly; the award kicker can also name a seat.
    for (const line of [edition.facts.kicker, edition.facts.line]) {
      const program = /(?:^| · )(?:grant )?program(?:\s*:\s*| · )([^·\n]+)/i
        .exec(line ?? '')?.[1]
        ?.trim();
      if (program) return `What has parliament said about ${program}?`;
    }
  }
  return `What has parliament said about ${title}?`;
}

/** Dates describe the frozen edition, never the time this phone saved it. */
export function editionSources(
  edition: EditionView,
  documents: readonly SourceOriginal[] = [],
): SourceDetails & { title: string } {
  const isMoney = ['program', 'grant', 'largest'].includes(edition.kind);
  const u = new URL(edition.path, 'https://opax.invalid');
  const award = u.searchParams.get('award') ?? u.searchParams.get('open');
  return {
    title: 'Daily edition',
    asOf: edition.date,
    citation: 'OPAX daily edition',
    originals: [
      {
        label: 'OPAX daily edition',
        url: edition.path,
        asOf: edition.date,
      },
      ...(isMoney
        ? [
            {
              label: 'GrantConnect',
              url: 'https://www.grants.gov.au/',
              ...(award ? { record: `record ${award}` } : {}),
            },
          ]
        : []),
      ...documents,
    ],
    // Today 7.2: the rule is its own "How this is chosen" group, and the
    // sheet carries no licence text (that is Sources and licences'). A row
    // that names a document already listed as an original is not repeated.
    rule: EDITION_RULE,
    notes: edition.sourceRows
      .map(plainSourceRow)
      .filter(
        (title) =>
          !documents.some((original) =>
            title
              .toLocaleLowerCase('en-AU')
              .startsWith(original.label.toLocaleLowerCase('en-AU')),
          ),
      ),
  };
}

/**
 * A licence the closing slide appends to a source row: ", CC BY-NC-ND 4.0",
 * ", CC0", ", public domain", ", Crown copyright". Licences live behind
 * Sources and licences, never in a row title.
 */
const licenceSuffix =
  /\s*[,;(]\s*(?:CC[ -]?(?:BY|0)\b[^,;()]*|creative commons\b[^,;()]*|public domain|crown copyright\b[^,;()]*|licen[cs]ed? under\b[^,;()]*)\)?\s*$/i;

/** A source row's plain title: the row as published, less its licence. */
export function plainSourceRow(row: string): string {
  let title = row.trim();
  for (let next = title.replace(licenceSuffix, '').trim(); next !== title; ) {
    title = next;
    next = title.replace(licenceSuffix, '').trim();
  }
  return title || row.trim();
}

/**
 * The page's Sources rows: plain titles, each matched to its original when
 * the bill lists one. Dated only when every row has a date of its own, so
 * the rows never mix dated and undated (the sheet dates each original).
 */
export function editionSourceRows(
  edition: Pick<EditionView, 'sourceRows'>,
  documents: readonly SourceOriginal[] = [],
): { title: string; original?: SourceOriginal; date?: DateInput }[] {
  const rows = edition.sourceRows.map((row) => {
    const title = plainSourceRow(row);
    const original = documents.find((item) =>
      title
        .toLocaleLowerCase('en-AU')
        .startsWith(item.label.toLocaleLowerCase('en-AU')),
    );
    return { title, original };
  });
  const dated = rows.length > 0 && rows.every((row) => row.original?.asOf);
  return rows.map((row) =>
    dated ? { ...row, date: row.original!.asOf! } : row,
  );
}
