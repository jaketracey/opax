import { useCallback, useMemo } from 'react';
import { RefreshControl } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  EmptyState,
  Group,
  Heading,
  LeadCard,
  OpaxWebLink,
  Screen,
  Section,
  Text,
} from '../../design/primitives';
import { chrome } from '../../design/tokens';
import { webPageUrl } from '../../navigation/external';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { RecordStatus } from '../RecordStatus';
import { AboutLeads } from './About';
import { ConcentrationChart, OverlapFlows } from './Chart';
import { discoveryAsOf, leadFor } from './model';

/**
 * One lead's comparison, as the web's /discover detail draws it: the
 * takeaway, the chart (or the two separate money flows), its note, then the
 * whole lead card with every caveat and example record, the web's links, and
 * "About these numbers" with the export's methodology.
 */
export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => catalogs.discovery(), []);
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const discovery = record?.data;
  const lead = useMemo(() => {
    const signal = discovery?.signals.find((s) => s.id === id);
    return signal ? leadFor(signal) : null;
  }, [discovery, id]);
  const comparison = lead?.comparison;
  // Links the guard refuses are left out rather than shown and refused.
  const links = lead?.links.filter((link) => webPageUrl(link.path)) ?? [];
  return (
    <>
      <Stack.Screen
        options={{ title: comparison?.heading ?? '', headerTitle: '' }}
      />
      <Screen
        testID={lead ? 'lead-screen' : 'lead-pending-screen'}
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
          label="Loading the lead"
          testID="lead"
        />
        {discovery && !lead ? (
          <EmptyState
            message="This lead is not in the current export."
            testID="lead-missing"
          />
        ) : null}
        {discovery && lead && comparison ? (
          <>
            <Group>
              <Text variant="kicker">Lead · {lead.categoryLabel}</Text>
              <Heading level={1} testID="lead-heading">
                {comparison.heading}
              </Heading>
              <Text wordSafe variant="lede" testID="lead-takeaway">
                {comparison.takeaway}
              </Text>
            </Group>
            {comparison.type === 'concentration' ? (
              <ConcentrationChart comparison={comparison} testID="lead-chart" />
            ) : (
              <OverlapFlows comparison={comparison} testID="lead-flows" />
            )}
            <Text wordSafe variant="fine" tone="ink" testID="lead-note">
              {comparison.note}
            </Text>
            <Section title="The lead and its caveats">
              <LeadCard
                lead={lead}
                category={lead.categoryLabel}
                asAt={{
                  asOf: discoveryAsOf(discovery),
                  citation: lead.citation,
                  savedAt: record?.stale ? record.savedAt : null,
                }}
                testID="lead-card"
              />
            </Section>
            {links.length ? (
              <Section title="On opax.com.au">
                {links.map((link) => (
                  <OpaxWebLink
                    key={link.testID}
                    label={link.label}
                    accessibilityLabel={link.accessibilityLabel}
                    path={link.path}
                    testID={`lead-link-${link.testID}`}
                  />
                ))}
              </Section>
            ) : null}
            <AboutLeads
              discovery={discovery}
              savedAt={record?.stale ? record.savedAt : null}
              lede
              testID="lead-about"
            />
          </>
        ) : null}
      </Screen>
    </>
  );
}
