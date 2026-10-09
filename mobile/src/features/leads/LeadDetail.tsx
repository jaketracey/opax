import { useCallback, useMemo } from 'react';
import { RefreshControl } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  EmptyState,
  Group,
  Heading,
  LeadCard,
  LinkRow,
  RowList,
  Screen,
  Section,
  SourceLine,
  Text,
} from '../../design/primitives';
import { chrome, rhythm } from '../../design/tokens';
import { openOnWeb, webPageUrl } from '../../navigation/external';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { RecordStatus } from '../RecordStatus';
import { leadsSource } from './About';
import { ConcentrationChart, OverlapFlows } from './Chart';
import { leadFor } from './model';

/**
 * One lead's comparison, as the web's /discover detail draws it: the
 * heading with "Lead · <category>" as its meta line, the takeaway, the chart
 * (or the two separate money flows) and its note, then the whole lead with
 * every caveat and example record, the web's links, and one source line
 * whose sheet holds "About these numbers" and the export's methodology.
 */
export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(
    (refresh: boolean) => catalogs.discovery(refresh),
    [],
  );
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
            <Group gap={rhythm.tight}>
              <Heading level={1} testID="lead-heading">
                {comparison.heading}
              </Heading>
              <Text wordSafe variant="metadata" testID="lead-meta">
                Lead · {lead.categoryLabel}
              </Text>
              <Text wordSafe variant="body" testID="lead-takeaway">
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
                testID="lead-card"
              />
            </Section>
            {links.length ? (
              <Section title="On opax.com.au">
                <RowList>
                  {links.map((link) => (
                    <LinkRow
                      key={link.testID}
                      title={link.label}
                      external
                      accessibilityLabel={link.accessibilityLabel}
                      accessibilityHint="Opens on opax.com.au"
                      testID={`lead-link-${link.testID}`}
                      onPress={() => void openOnWeb(link.path, link.label)}
                    />
                  ))}
                </RowList>
              </Section>
            ) : null}
            <SourceLine
              {...leadsSource(
                discovery,
                record?.stale ? record.savedAt : null,
              )}
              citation={lead.citation}
              testID="lead-source"
            />
          </>
        ) : null}
      </Screen>
    </>
  );
}
