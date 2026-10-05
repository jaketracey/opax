import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  AsAtLine,
  Button,
  Divider,
  EmptyState,
  Group,
  LeadCard,
  Screen,
  Section,
  SegmentedControl,
  SourceLink,
  Text,
  type Segment,
} from '../../design/primitives';
import { chrome, spacing } from '../../design/tokens';
import { leadRoute } from '../../navigation/routes';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { RecordRow } from '../RecordRow';
import { RecordStatus } from '../RecordStatus';
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
  const load = useCallback(() => catalogs.discovery(), []);
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
  // The registers the example records open, named as the cards name them.
  const registers = useMemo(() => {
    const found = new Map<string, string>();
    for (const lead of discovery ? leadsFor(discovery) : [])
      for (const item of lead.evidence)
        if (item.url?.startsWith('https://') && !found.has(item.register))
          found.set(item.register, item.url);
    return [...found];
  }, [discovery]);
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
          <Text wordSafe variant="lede" testID="leads-lede">
            {aboutLede(discovery)}
          </Text>
          <Group>
            <SegmentedControl
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
          </Group>
          {leads.length ? (
            <View>
              {leads.slice(0, visible).map((lead, index) => (
                <View key={lead.id} style={styles.lead}>
                  {index > 0 ? <Divider /> : null}
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
          <Section title="About these numbers" testID="leads-about">
            <Group gap={spacing.s3}>
              {discovery.methodology.map((method, index) => (
                <Text
                  key={index}
                  wordSafe
                  variant="fine"
                  tone="ink"
                  testID={`leads-method-${index}`}
                >
                  {method}
                </Text>
              ))}
            </Group>
            <AsAtLine
              asOf={asOf}
              citation={['AEC annual returns', 'AusTender']}
              savedAt={savedAt}
              testID="leads-as-at"
            />
            {registers.map(([name, url], index) => (
              <SourceLink
                key={name}
                citation={name}
                url={url}
                kind="register"
                testID={`leads-register-${index}`}
              />
            ))}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { gap: spacing.s4 },
});
