import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  Button,
  EmptyState,
  Group,
  LeadCard,
  Screen,
  ChoiceChips,
  SegmentedControl,
  Text,
  type Segment,
} from '../../design/primitives';
import { chrome, colors, hairline, radii, spacing } from '../../design/tokens';
import { leadRoute } from '../../navigation/routes';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { RecordRow } from '../RecordRow';
import { RecordStatus } from '../RecordStatus';
import { AboutLeads } from './About';
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
 * Leads (P1): every signal in /discovery.json as a card that keeps its
 * figures, every caveat, its example records and its as-at line, with a row
 * to the comparison behind it. "All leads" keeps the export's order.
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
  const asOf = discovery ? discoveryAsOf(discovery) : null;
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
          <Text wordSafe variant="body" testID="leads-lede">
            {aboutLede(discovery)}
          </Text>
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
            {hidden ? (
              <Text wordSafe variant="fine" tone="ink" testID="leads-hidden">
                {leadCount(hidden, 'all')} in this export could not be read and{' '}
                {hidden === 1 ? 'is' : 'are'} not shown.
              </Text>
            ) : null}
          </Group>
          {leads.length ? (
            <View>
              {leads.slice(0, visible).map((lead, index) => (
                <View key={lead.id} style={styles.lead}>
                  <LeadCard
                    lead={lead}
                    category={lead.categoryLabel}
                    asAt={{ asOf, citation: lead.citation, savedAt }}
                    testID={`lead-${index}`}
                  />
                  <RecordRow
                    title="See the comparison"
                    detail={lead.comparison.heading}
                    onPress={() => router.push(leadRoute(lead.id))}
                    testID={`lead-${index}-open`}
                  />
                </View>
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
          <AboutLeads
            discovery={discovery}
            savedAt={savedAt}
            testID="leads-about"
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // A raised card per lead: the feed scans as separate leads.
  lead: {
    gap: spacing.s3,
    backgroundColor: colors.raised,
    borderRadius: radii.md,
    borderWidth: hairline,
    borderColor: colors.line,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s2,
    marginBottom: spacing.s4,
  },
});
