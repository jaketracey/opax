import { RouteOptions } from '../navigation/preview';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import {
  EmptyState,
  LayoutRegion,
  SidebarSafe,
  SplitLayout,
  useAdaptiveDevice,
  useLayout,
} from '../design/primitives';
import { colors } from '../design/tokens';
import {
  RecordDetail,
  RecordShare,
} from './split/RecordDetail';
import {
  encodeEntry,
  entryForRoute,
  entryFromRoute,
  entryLabel,
  entryRoute,
  hasPaneActions,
  type RecordEntry,
} from './split/entry';
import { SearchScreen } from './search/SearchScreen';
import { SearchSplitContext } from './search/split';
import type { PaneRow } from './search/ResultsView';

/**
 * Search. On iPhone (and a compact iPad window) the screen alone; on iPad
 * regular width a split, the results on the left and the chosen person,
 * party, electorate, bill or record in the pane, which opens on the first
 * result row rather than an empty pane.
 */
export default function Search() {
  const adaptive = useAdaptiveDevice();
  if (!adaptive) return <SearchScreen />;
  return (
    <SidebarSafe style={styles.screen}>
      <LayoutRegion style={styles.screen}>
        <SearchSplit />
      </LayoutRegion>
    </SidebarSafe>
  );
}

function SearchSplit() {
  const split = useLayout().split;
  const [selected, setSelected] = useState<RecordEntry | null>(null);
  const [entries, setEntries] = useState<RecordEntry[]>([]);
  const onRows = useCallback((rows: PaneRow[]) => {
    const next = rows.flatMap((row) => {
      const entry = entryForRoute(row.route, row.title);
      return entry ? [entry] : [];
    });
    setEntries(next);
    // A new search starts on its own first row.
    setSelected((current) =>
      current && next.some((e) => encodeEntry(e) === encodeEntry(current))
        ? current
        : null,
    );
  }, []);
  const first = entries[0] ?? null;
  const keys = useMemo(() => entries.map(encodeEntry), [entries]);
  const effective = selected ?? first;
  const context = useMemo(
    () =>
      split
        ? {
            select: (entry: RecordEntry) => setSelected(entry),
            selectedKey: effective ? encodeEntry(effective) : null,
          }
        : null,
    [split, effective],
  );
  const list = (
    <SearchSplitContext.Provider value={context}>
      <SearchScreen onRows={split ? onRows : undefined} />
    </SearchSplitContext.Provider>
  );
  return (
    <>
      {/* The list column keeps an inline title; large titles over two
          panes would collapse with whichever scrolls first. On every device
          with a split, the Duo's inner display included (sweep 2, item 10). */}
      {split ? (
        <RouteOptions options={{ headerLargeTitleEnabled: false }} />
      ) : null}
      <SplitLayout<RecordEntry>
        id="search"
        testID="search-split"
        list={list}
        selected={selected}
        initialSelection={() => first}
        onSelect={setSelected}
        entryKey={encodeEntry}
        entryRoute={entryRoute}
        entryFromRoute={entryFromRoute}
        entryTitle={entryLabel}
        keys={keys}
        entryForKey={(key) =>
          entries.find((entry) => encodeEntry(entry) === key)!
        }
        renderDetail={(entry) => <RecordDetail entry={entry} />}
        detailActions={(entry) =>
          hasPaneActions(entry) ? <RecordShare entry={entry} /> : null
        }
        empty={
          <EmptyState
            size="pane"
            icon="magnifyingglass"
            title="Search for a person, bill or topic"
            testID="search-split-empty"
          />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
});
