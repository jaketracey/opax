import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { catalogs } from '../../api/runtime';
import {
  Button,
  EmptyState,
  Group,
  Screen,
  ChoiceChips,
  SegmentedControl,
  SourceLine,
  Text,
  type Segment,
} from '../../design/primitives';
import { chrome, rhythm } from '../../design/tokens';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { RecordStatus } from '../RecordStatus';
import { leadsSource } from './About';
import { LeadFeedCard } from './LeadFeedCard';
import {
  aboutLede,
  categoryOption,
  discoveryAsOf,
  leadCategories,
  leadCount,
  leadsFor,
  type LeadFilter,
  type LeadSort,
} from './model';

const PAGE = 10;
const filters: readonly Segment<LeadFilter>[] = [
  { value: 'all', label: 'All leads', testID: 'leads-filter-all' },
  ...leadCategories.map((category) => ({
    value: category,
    label: categoryOption(category),
    testID: `leads-filter-${category}`,
  })),
];
// The web's sort options; companies in both have no share to sort by.
const sorts: readonly Segment<LeadSort>[] = [
  { value: 'value', label: 'Largest totals', testID: 'leads-sort-value' },
  { value: 'share', label: 'Biggest share', testID: 'leads-sort-share' },
];

/**
 * Leads (P1): every signal in /discovery.json as a card that opens its
 * comparison. The lede says what a lead is, and one source line under it
 * dates the export and holds its methodology. Each card keeps its title,
 * figure, sentence, first caveat and a source line to its example records
 * and every caveat. "All leads" keeps the export's order.
 */
export default function Leads() {
  const load = useCallback(
    (refresh: boolean) => catalogs.discovery(refresh),
    [],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [sort, setSort] = useState<LeadSort>('value');
  const [visible, setVisible] = useState(PAGE);
  const discovery = record?.data;
  const leads = useMemo(
    () => (discovery ? leadsFor(discovery, filter, sort) : []),
    [discovery, filter, sort],
  );
  const savedAt = record?.stale ? record.savedAt : null;
  // Signals the app cannot show faithfully are left out, and said to be.
  const hidden = discovery
    ? discovery.unreadable +
      discovery.signals.length -
      leadsFor(discovery).length
    : 0;
  const choose = (next: LeadFilter) => {
    setFilter(next);
    setVisible(PAGE);
  };
  return (
    <Screen
      testID="leads-screen"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={chrome.tint}
        />
      }
    >
      <RecordStatus
        record={record}
        error={error}
        refreshing={refreshing}
        refresh={refresh}
        retry={retry}
        label="Loading the leads"
        testID="leads"
      />
      {discovery ? (
        <>
          <Group gap={rhythm.tight}>
            <Text wordSafe variant="body" testID="leads-lede">
              {aboutLede(discovery)}
            </Text>
            <SourceLine
              {...leadsSource(discovery, savedAt)}
              testID="leads-source"
            />
          </Group>
          <Group>
            <ChoiceChips
              segments={filters}
              value={filter}
              onChange={choose}
              testID="leads-filter"
            />
            {filter !== 'all' && filter !== 'donor_contract_overlap' ? (
              <SegmentedControl
                segments={sorts}
                value={sort}
                onChange={(next) => {
                  setSort(next);
                  setVisible(PAGE);
                }}
                testID="leads-sort"
              />
            ) : null}
            <Text variant="metadata" testID="leads-count">
              {leadCount(leads.length, filter)}
            </Text>
            {discovery?.withheld ? (
              <Text wordSafe variant="fine" testID="leads-withheld">
                {leadCount(discovery.withheld, 'all')} about a donor not named
                in OPAX {discovery.withheld === 1 ? 'is' : 'are'} not shown.
              </Text>
            ) : null}
            {hidden ? (
              <Text wordSafe variant="fine" tone="ink" testID="leads-hidden">
                {leadCount(hidden, 'all')} in this export could not be read and{' '}
                {hidden === 1 ? 'is' : 'are'} not shown.
              </Text>
            ) : null}
          </Group>
          {leads.length ? (
            <View style={styles.cards}>
              {leads.slice(0, visible).map((lead, index) => (
                <LeadFeedCard
                  key={lead.id}
                  lead={lead}
                  asOf={discoveryAsOf(discovery)}
                  testID={`lead-${index}`}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              message="No leads of this kind are in this export."
              testID="leads-empty"
            />
          )}
          {leads.length > visible ? (
            <Button
              label="Show more"
              onPress={() => setVisible((n) => n + PAGE)}
              testID="leads-more"
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Cards stand apart by a block's gap; nothing nests them.
  cards: { gap: rhythm.block },
});
