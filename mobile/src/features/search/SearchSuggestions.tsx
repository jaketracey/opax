import { ElectionSearchRow } from '../vic-election/SearchRow';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { formatCount } from '../../design/format';
import {
  Group,
  InlineError,
  InsetGroup,
  LinkRow,
  SectionHeader,
  Skeleton,
  SuggestionRow,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { asksAsTyped } from './recovery';
import { suggestionList, type GroupKind, type MatchSources } from './ranking';
import { MatchRow, type RowSources } from './rows';
import { scopeMenuAt } from './ScopeBar';
import { ReportResults, useReportSearch } from './ReportResults';

/**
 * Typing (journeys/search.md 3.3). Computed on the device from files the
 * app already caches, plus the bundled topics. Reports use a debounced,
 * report-only catalogue read. A Top suggestion leads only when a name matches
 * exactly or by prefix; otherwise "Search speeches for …" leads. "Ask OPAX
 * about …" is always last. No `SourceLine`: suggestions are navigation.
 */
export function SearchSuggestions({
  q,
  sources,
  loading,
  failed,
  onRetry,
  onSearchSpeeches,
  onAsk,
  onSeeAll,
}: {
  q: string;
  sources: (MatchSources & RowSources) | null;
  /** First launch only: the static files are still arriving. */
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onSearchSpeeches: () => void;
  onAsk: () => void;
  /** AX3 and above: "See all {n} {group}" under each one-row group. */
  onSeeAll: (group: GroupKind) => void;
}) {
  // At AX3 and above a group shows one row and a "See all" row (3.10).
  const ax3 = scopeMenuAt(useWindowDimensions().fontScale);
  const text = q.trim();
  const reports = useReportSearch(text, true);
  const list = sources
    ? suggestionList(text, sources, ax3 ? 1 : 3)
    : { top: null, groups: [] };
  const speeches = (
    <SuggestionRow
      symbol="magnifyingglass"
      name={`Search speeches for “${text}”`}
      onPress={onSearchSpeeches}
      testID="search-speeches-row"
    />
  );
  return (
    <Group gap={rhythm.group} testID="search-suggestions">
      <InsetGroup>
        <ElectionSearchRow q={q} />
        {list.top ? (
          <MatchRow
            match={list.top}
            q={text}
            sources={sources!}
            variant="suggestion"
            testID="search-top-suggestion"
          />
        ) : null}
        {speeches}
      </InsetGroup>
      {loading && !sources ? (
        <Skeleton shape="people" count={3} label="Loading suggestions" />
      ) : null}
      {list.groups.map((group) => (
        <View key={group.kind} testID={`search-suggestions-${group.kind}`}>
          <SectionHeader title={group.label} level={3} />
          <View style={styles.rows}>
            <InsetGroup>
              {group.rows.map((match) => (
                <MatchRow
                  key={`${match.kind}:${match.key}`}
                  match={match}
                  q={text}
                  sources={sources!}
                  variant="suggestion"
                />
              ))}
              {ax3 && group.total > group.rows.length ? (
                <LinkRow
                  title={`See all ${formatCount(group.total)} ${group.label.toLowerCase()}`}
                  onPress={() => onSeeAll(group.kind)}
                  testID={`search-suggestions-${group.kind}-all`}
                />
              ) : null}
            </InsetGroup>
          </View>
        </View>
      ))}
      <ReportResults q={text} read={reports} suggestion limit={ax3 ? 1 : 3} />
      {failed ? (
        <InlineError
          subject="Suggestions"
          message="Suggestions couldn’t be loaded."
          onRetry={onRetry}
          testID="search-suggestions-error"
        />
      ) : null}
      <InsetGroup>
        <SuggestionRow
          symbol="text.bubble"
          name={`Ask OPAX about “${text}”`}
          // Typed as a full question, the row asks it at once (SearchScreen).
          accessibilityHint={
            asksAsTyped(text) ? 'Asks this question' : undefined
          }
          onPress={onAsk}
          testID="search-ask-row"
        />
      </InsetGroup>
    </Group>
  );
}

const styles = StyleSheet.create({
  rows: { marginTop: rhythm.heading },
});
