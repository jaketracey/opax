import { useCallback, useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../../api/runtime';
import { formatCount } from '../../design/format';
import { LeadEvidenceLink } from '../../design/lead';
import {
  Divider,
  EmptyState,
  Group,
  Heading,
  Icon,
  LinkRow,
  RowList,
  Screen,
  Section,
  SourceLine,
  SubSection,
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
 * heading with "Lead · <category>" as its meta line, the takeaway and the
 * chart (or the two separate money flows). Then "How this lead was found"
 * (design pass 5, P2-13): the comparison's method note, every caveat
 * verbatim and in full, and the example records, without restating the
 * lead's title, sentence or figures the top already gives. Then the web's
 * links and one source line whose sheet holds "About these numbers" and the
 * export's methodology.
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
            <Section title="How this lead was found" testID="lead-method">
              <Text wordSafe variant="body" testID="lead-note">
                {comparison.note}
              </Text>
              {lead.caveats.length ? (
                <View style={styles.caveats}>
                  {lead.caveats.map((caveat, index) => (
                    <View key={index} style={styles.caveat}>
                      <Icon
                        name="exclamationmark.triangle"
                        size={13}
                        tone="inkSoft"
                      />
                      <Text
                        wordSafe
                        variant="fine"
                        tone="ink"
                        testID={`lead-caveat-${index}`}
                        style={styles.grow}
                      >
                        {caveat}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {lead.evidence.length ? (
                <SubSection
                  title={`Example records (${formatCount(lead.evidence.length)})`}
                  testID="lead-evidence"
                >
                  <View>
                    {lead.evidence.map((item, index) => (
                      <View key={index}>
                        {index > 0 ? <Divider variant="subtle" /> : null}
                        <LeadEvidenceLink
                          item={item}
                          testID={`lead-evidence-${index}`}
                        />
                      </View>
                    ))}
                  </View>
                </SubSection>
              ) : null}
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
              {...leadsSource(discovery, record?.stale ? record.savedAt : null)}
              citation={lead.citation}
              testID="lead-source"
            />
          </>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  caveats: { gap: rhythm.tight },
  caveat: { flexDirection: 'row', gap: rhythm.tight, alignItems: 'flex-start' },
  grow: { flex: 1 },
});
