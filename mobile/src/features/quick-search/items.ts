import type { Href } from 'expo-router';
import { billEnding, billStatusLabel } from '../../api/bill-status';
import type { SFSymbol } from '../../design/symbols';
import { reportRoute } from '../../navigation/routes/records';
import { topicRoute } from '../../navigation/routes/search';
import { suggestionList, type Match } from '../search/ranking';
import type { RecentSearch } from '../search/recent';
import type { GroupRow } from '../search/requests';
import {
  matchRoute,
  placeLine,
  seatMembersLine,
  serviceStatus,
  type RowSources,
} from '../search/rows';
import { scopeLabel, type Scope } from '../search/scopes';
import type { SearchSources } from '../search/sources';

/**
 * The wide Today field's dropdown, as data. It mirrors the website's quick
 * search (portal/public/quick-search.js and the `quickSearchSuggestions`
 * source in app.js): a "Search" row first, then matches by type, each row
 * naming its type. The matches are the Search tab's own (`suggestionList`
 * over the cached static files); nothing here reads or ranks anything new.
 */
export type QuickAction =
  /** Push a route in Today's stack: the route the Search tab's row pushes. */
  | { kind: 'route'; route: Href }
  /** A person not yet joined to the people catalogue: Search's resolver. */
  | { kind: 'person'; name: string }
  /** Open the Search tab with the words submitted. */
  | { kind: 'search'; q: string; scope: Scope }
  /** Ask's draft for the words (or the question itself). */
  | { kind: 'ask'; q: string };

export interface QuickItem {
  key: string;
  title: string;
  secondary?: string;
  /** The row's type, as the website's dropdown names it. */
  type: string;
  symbol: SFSymbol;
  action: QuickAction;
}
export interface QuickSection {
  key: string;
  /** Spoken and drawn as a header; the lead and closing rows have none. */
  label?: string;
  items: QuickItem[];
}

const typeNames = {
  people: 'Person',
  electorates: 'Electorate',
  bills: 'Bill',
  topics: 'Topic',
  parties: 'Party',
} as const;
const typeSymbols = {
  people: 'person.crop.circle',
  electorates: 'map',
  bills: 'doc.text',
  topics: 'number',
  parties: 'person.3',
} as const satisfies Record<Match['kind'], SFSymbol>;

function matchTitle(match: Match): string {
  switch (match.kind) {
    case 'people':
    case 'electorates':
    case 'parties':
      return match.item.name;
    case 'bills':
      return match.item.short_title || match.item.title;
    case 'topics':
      return match.item.title;
  }
}

/** One match as a row; its action is the Search tab row's own destination. */
export function matchItem(match: Match, sources: RowSources): QuickItem {
  const route = matchRoute(match, sources);
  const action: QuickAction = route
    ? { kind: 'route', route: route as Href }
    : match.kind === 'topics'
      ? {
          kind: 'route',
          route: topicRoute(match.item.slug, {}, match.item.title) as Href,
        }
      : { kind: 'person', name: matchTitle(match) };
  let secondary: string | undefined;
  if (match.kind === 'people')
    // Identity guard, as in Search: no place line before the join.
    secondary = route
      ? (placeLine(match.item, serviceStatus(match.item, sources), sources) ??
        undefined)
      : undefined;
  else if (match.kind === 'bills')
    secondary = billStatusLabel(match.item.status, billEnding(match.item));
  else if (match.kind === 'electorates')
    // "Last member: Name" while the seat's house has no members.
    secondary = seatMembersLine(match.item, sources) || undefined;
  return {
    key: `${match.kind}:${match.key}`,
    title: matchTitle(match),
    secondary,
    type: typeNames[match.kind],
    symbol: typeSymbols[match.kind],
    action,
  };
}

export function quickSections({
  q,
  sources,
  recents,
  reports = [],
  perGroup = 3,
}: {
  q: string;
  sources: SearchSources | null;
  recents: readonly RecentSearch[];
  /** The Search tab's debounced report typeahead, once it has answered. */
  reports?: readonly GroupRow[];
  perGroup?: number;
}): QuickSection[] {
  const text = q.trim();
  if (!text)
    return recents.length
      ? [
          {
            key: 'recent',
            label: 'Recent searches',
            items: recents.map((item) => ({
              key: `recent:${item.q}`,
              title: item.q,
              secondary:
                item.scope === 'all' ? undefined : scopeLabel(item.scope),
              type: 'Recent',
              symbol: 'clock',
              action: { kind: 'search', q: item.q, scope: item.scope },
            })),
          },
        ]
      : [];
  const list = sources
    ? suggestionList(text, sources, perGroup)
    : { top: null, groups: [] };
  const sections: QuickSection[] = [
    {
      key: 'lead',
      items: [
        ...(list.top ? [matchItem(list.top, sources!)] : []),
        {
          key: 'search',
          title: `Search for “${text}”`,
          type: 'Search',
          symbol: 'magnifyingglass',
          action: { kind: 'search', q: text, scope: 'all' },
        },
      ],
    },
    ...list.groups.map((group) => ({
      key: group.kind,
      label: group.label,
      items: group.rows.map((row) => matchItem(row, sources!)),
    })),
  ];
  if (text.length >= 2 && reports.length)
    sections.push({
      key: 'reports',
      label: 'Reports',
      items: reports.slice(0, perGroup).map((row) => ({
        key: `report:${row.slug}`,
        title: row.title,
        type: 'Report',
        symbol: 'doc.text',
        action: {
          kind: 'route',
          route: reportRoute(row.slug, row.title) as Href,
        },
      })),
    });
  sections.push({
    key: 'ask',
    items: [
      {
        key: 'ask',
        title: `Ask OPAX about “${text}”`,
        type: 'Ask',
        symbol: 'text.bubble',
        action: { kind: 'ask', q: text },
      },
    ],
  });
  return sections;
}

export const flatItems = (sections: readonly QuickSection[]): QuickItem[] =>
  sections.flatMap((section) => section.items);

/** "6 suggestions" for VoiceOver, with the groups named. */
export function suggestionAnnouncement(
  sections: readonly QuickSection[],
): string {
  const count = flatItems(sections).length;
  if (!count) return 'No suggestions';
  const groups = sections
    .map((section) => section.label)
    .filter((label): label is string => !!label);
  return [
    `${count} ${count === 1 ? 'suggestion' : 'suggestions'}`,
    ...(groups.length ? [groups.join(', ')] : []),
  ].join(': ');
}
