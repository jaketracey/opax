import { useEffect, useState } from 'react';
import { router, type NativeStackHeaderItem } from 'expo-router';
import {
  filtersItem,
  pageMenu,
  type RowMenuAction,
} from '../../navigation/chrome';
import { shareHeaderItem, shareRecord } from '../../navigation/share';
import { filtersRoute } from '../../navigation/routes/filters';
import { useOpenAsk } from '../ask/open';
import type { Roster } from '../../api/catalog-decoders';
import {
  clearedFilters,
  filtersToParams,
  hasFilters,
  personChoices,
  registerSearchFilters,
  type SpeechFilters,
} from './filters';
import { askDraft, withoutQuotes } from './recovery';
import type { RecoveryHandlers } from './EmptyResults';
import { speechSorts, type SpeechSort } from './speeches';
import { webSearchPath, type ResultsTarget, type Scope } from './scopes';

const SHARE_TITLE = 'Search on OPAX';

/**
 * What the Search root and a pushed `/results` share: the filters (one
 * `/filters/search` sheet per owner), the sort, the recovery actions and
 * the bar items of journeys/search.md 3.5.
 */
export function useResultsControls({
  owner,
  q,
  target,
  initialFilters,
  roster,
  onQuery,
  onScope,
}: {
  owner: string;
  q: string;
  target: ResultsTarget;
  initialFilters: SpeechFilters;
  roster: Roster | null;
  onQuery: (q: string) => void;
  onScope: (scope: Scope) => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [sort, setSort] = useState<SpeechSort>('relevance');
  const openAsk = useOpenAsk();
  // The sheet reads and writes this owner's filters; the Person row lists
  // the roster once it has loaded.
  useEffect(() => {
    registerSearchFilters(owner, filters, setFilters, personChoices(roster));
  }, [owner, filters, roster]);
  const recover: RecoveryHandlers = {
    onAsk: () => openAsk({ question: askDraft(q) }),
    onAll: () => onScope('all'),
    onClearFilters: () => setFilters(clearedFilters(filters)),
    onUnquote: () => onQuery(withoutQuotes(q)),
    onSpeeches: () => onScope('speeches'),
  };
  const openFilters = () => router.push(filtersRoute('search', owner));
  const share = () =>
    void shareRecord({
      path: webSearchPath(q, target, filtersToParams(filters)),
      title: SHARE_TITLE,
    });
  /** Speeches: Filters and ⋯ (Sort ›, Share); elsewhere Share alone. */
  const items = (): NativeStackHeaderItem[] => {
    if (!q.trim()) return [];
    if (target.scope !== 'speeches')
      return [
        shareHeaderItem({
          path: webSearchPath(q, target, filtersToParams(filters)),
          title: SHARE_TITLE,
        }),
      ];
    const sortMenu: RowMenuAction = {
      title: 'Sort',
      symbol: 'line.3.horizontal.decrease',
      items: speechSorts.map((s) => ({
        title: s.label,
        symbol: s.value === sort ? 'checkmark' : undefined,
        onPress: () => setSort(s.value),
      })),
    };
    return [
      pageMenu({
        name: 'these results',
        items: [
          sortMenu,
          { title: 'Share', symbol: 'square.and.arrow.up', onPress: share },
        ],
      }),
      filtersItem({
        active: hasFilters(filters),
        href: filtersRoute('search', owner),
      }),
    ];
  };
  return {
    filters,
    setFilters,
    sort,
    setSort,
    recover,
    openFilters,
    items,
  };
}
