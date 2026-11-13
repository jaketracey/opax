import type { Href } from 'expo-router';
import type { BillIndex } from '../../api/catalog-decoders';
import { billName } from '../../api/bill-transforms';
import type { PersonProfile } from '../../api/person-identity';
import {
  editionTitles,
  recentBillsFor,
  type EditionView,
} from '../../api/selectors';
import type { SFSymbol } from '../../design/icon';
import { billRoute } from '../../navigation/routes/bills';
import { personRoute } from '../../navigation/routes/people';
import { topicRoute } from '../../navigation/routes/search';
import {
  editionSubject,
  editionSymbol,
  editionTier,
  editionTopic,
} from '../edition/model';
import { allTopics, fold, type TopicMatch } from './ranking';

/**
 * Search's "Try" group (sweep 1 item 5): up to four rows chosen by rule from
 * what the device already holds, never by popularity. In order: the reader's
 * member (a saved seat), the daily edition's subject, the newest bill in the
 * register, and one topic the edition touches (else one by the edition's
 * date). Each row opens its record, or searches its words when the record
 * has no native page. With Recent showing, the group keeps two rows.
 */
export type TryRow = {
  key: string;
  title: string;
  /** Why this row is here, in plain words: never a ranking. */
  detail: string;
  symbol: SFSymbol;
  action: { href: Href } | { q: string };
};
export const TRY_SHOWN = 4;
export const TRY_WITH_RECENT = 2;

const firstWord = (name: string) => name.split(/\s+/)[0] ?? name;
const wholeWord = (haystack: string, word: string) => {
  const needle = fold(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    !!needle && new RegExp(`(^|[^a-z0-9])${needle}($|[^a-z0-9])`).test(haystack)
  );
};
/**
 * A topic the edition names (its title or paragraphs mention the topic's
 * first word or one of its everyday aliases); otherwise one by the edition's
 * date, so it changes each day and is the same for every reader that day.
 */
export function tryTopic(
  edition: Pick<EditionView, 'title' | 'paragraphs' | 'date'> | null,
  topics: readonly TopicMatch[] = allTopics,
): TopicMatch | null {
  if (!topics.length) return null;
  if (!edition) return null;
  const text = fold([edition.title, ...edition.paragraphs].join(' '));
  const named = topics.find((topic) =>
    [firstWord(topic.title), ...(topic.aliases ?? [])].some((word) =>
      wholeWord(text, word),
    ),
  );
  if (named) return named;
  const day = Math.floor(Date.parse(edition.date.slice(0, 10)) / 86_400_000);
  return Number.isFinite(day) ? topics[day % topics.length]! : null;
}

export function tryRows({
  member,
  edition,
  bills,
  hasRecent = false,
  today = new Date(),
  topics = allTopics,
}: {
  member: Pick<PersonProfile, 'slug' | 'name'> | null;
  edition: EditionView | null;
  bills: BillIndex | null;
  hasRecent?: boolean;
  today?: Date | string;
  topics?: readonly TopicMatch[];
}): TryRow[] {
  const rows: TryRow[] = [];
  const seen = new Set<string>();
  const add = (row: TryRow) => {
    const key = fold(row.title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };
  if (member)
    add({
      key: 'member',
      title: member.name,
      detail: 'Your member',
      symbol: 'person.crop.circle',
      action: { href: personRoute(member.slug, member.name) },
    });
  // Today shows editions up to 14 days old; an older one is not "today's".
  const current =
    edition && editionTier(edition.date, today) !== 'old' ? edition : null;
  if (current) {
    const titled = bills
      ? { ...current, ...editionTitles(current, bills) }
      : current;
    const topic = current.kind === 'topic' ? editionTopic(current) : null;
    const title = topic?.name ?? titled.shortTitle ?? titled.cardTitle;
    const href = editionSubject(current);
    add({
      key: 'edition',
      title,
      detail: 'Daily edition',
      symbol: editionSymbol(current),
      action: href ? { href } : { q: title },
    });
  }
  const newest = bills ? recentBillsFor(bills, 1, 'new').data?.[0] : null;
  if (newest) {
    const name = billName(newest);
    add({
      key: 'bill',
      title: name,
      detail: 'Newest bill',
      symbol: 'doc.text',
      action: { href: billRoute(newest.key, name) },
    });
  }
  const topic = current?.kind === 'topic' ? null : tryTopic(current, topics);
  if (topic)
    add({
      key: 'topic',
      title: topic.title,
      detail: 'Topic',
      symbol: 'number',
      action: { href: topicRoute(topic.slug, {}, topic.title) },
    });
  return rows.slice(0, hasRecent ? TRY_WITH_RECENT : TRY_SHOWN);
}
