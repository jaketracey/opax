import { RouteOptions } from '../../navigation/preview';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { ApiError } from '../../api/errors';
import { apiClient, catalogs } from '../../api/runtime';
import { copy } from '../../design/copy';
import {
  formatCount,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../../design/format';
import { Section } from '../../design/layout';
import {
  ContentUnavailable,
  FigureBlock,
  Group,
  Heading,
  LinkRow,
  MoneyRow,
  OfflineLine,
  Screen,
  SectionHeader,
  Skeleton,
  SourceLine,
  StatStrip,
  Text,
  type FigureSource,
} from '../../design/primitives';
import { symbols } from '../../design/symbols';
import { colors, rhythm } from '../../design/tokens';
import { headerItems, pageItems } from '../../navigation/chrome';
import { moneyRoute } from '../../navigation/routes/money-map';
import { partyRoute } from '../../navigation/routes/people';
import {
  agencyRoute,
  leadsRoute,
  moneyItemRoute,
  moneyRecordRoute,
} from '../../navigation/routes/public-money';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { money } from '../money-public/runtime';
import { decodeMoneyGraph, moneyCatalogs } from '../money/data';
import {
  donorNodeFor,
  loadedMoneyGraph,
  normaliseOrganisation,
  rememberMoneyGraph,
} from '../money/lookup';
import { moneyPageMenu } from '../money/menu';
import { PartyDot } from '../money/parts';
import { ConcentrationChart } from './Chart';
import { evidenceRecord, evidenceRow } from './evidence';
import {
  aboutLede,
  categorySource,
  discoverPath,
  discoveryAsOf,
  leadFor,
  leadsHiddenNotes,
  plainCaveat,
  type LeadView,
} from './model';

export { evidenceRow } from './evidence';

/** The subject's own page in the app, when it has one. */
function useSubject(lead: LeadView | null): {
  title: string;
  detail?: string;
  href: Href;
  party?: boolean;
} | null {
  const [agency, setAgency] = useState<{ id: string; name: string } | null>(
    null,
  );
  const subject = lead?.comparison.heading ?? null;
  const contracts = lead?.category === 'procurement_concentration';
  const overlap = lead?.category === 'donor_contract_overlap';
  // A company in both is found on the money map. The lead page (unlike the
  // money record) loads the federal graph itself, after the lead has drawn,
  // when no screen has loaded it yet; failing, the row is not drawn.
  const [graph, setGraph] = useState(() => loadedMoneyGraph('federal'));
  useEffect(() => {
    if (!overlap || graph) return;
    let active = true;
    Promise.resolve()
      .then(() => apiClient.get(moneyCatalogs.federal.path, decodeMoneyGraph))
      .then(
        (record) => {
          rememberMoneyGraph('federal', record.data);
          if (active) setGraph(record.data);
        },
        () => undefined,
      );
    return () => {
      active = false;
    };
  }, [overlap, graph]);
  useEffect(() => {
    if (!contracts || !subject) return;
    let active = true;
    const wanted = normaliseOrganisation(subject);
    money.agencies().then(
      (record) => {
        const found = record.data.agencies.find(
          (a) => normaliseOrganisation(a.name) === wanted,
        );
        if (active && found) setAgency({ id: found.id, name: found.name });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [contracts, subject]);
  if (!lead || !subject) return null;
  if (contracts)
    return agency
      ? { title: agency.name, href: agencyRoute(agency.id, agency.name) }
      : null;
  if (lead.category === 'recipient_concentration')
    return { title: subject, href: partyRoute(subject), party: true };
  const donor = graph ? donorNodeFor({ name: lead.entity }, graph) : null;
  return donor
    ? {
        title: donor.label,
        detail: 'Donor on the money map',
        href: moneyRecordRoute({ node: donor.id }, donor.label),
      }
    : null;
}

/**
 * One lead (specs/money.md 2.10): its kind, its subject, the sentence the
 * reader tapped, a way to the subject's own page, then the comparison
 * (a concentration's share chart, or the two money flows side by side,
 * never added), how the lead was found and its example records. Every step
 * stays in the app; the web comparison is in the ⋯ menu.
 */
export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const load = useCallback(
    (refresh: boolean) => catalogs.discovery(refresh),
    [],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const discovery = record?.data ?? null;
  const lead = useMemo(() => {
    const signal = discovery?.signals.find((s) => s.id === id);
    return signal ? leadFor(signal) : null;
  }, [discovery, id]);
  const subject = useSubject(lead);
  const comparison = lead?.comparison;
  const offline =
    error instanceof ApiError &&
    (error.code === 'offline' || error.code === 'timeout');
  const source: FigureSource | null =
    discovery && lead
      ? {
          asOf: discoveryAsOf(discovery),
          citation: categorySource(lead.category),
          savedAt: record?.stale ? record.savedAt : null,
          notes: [
            aboutLede(discovery),
            ...discovery.methodology,
            ...leadsHiddenNotes(discovery),
          ],
          testID: 'lead-source',
        }
      : null;
  // The party is on the money map: its record opens from the map's focus.
  const mapRow =
    lead?.category === 'recipient_concentration' && comparison
      ? moneyRoute(comparison.heading)
      : null;
  // The bar title fades in by scroll with no width at rest, so the back
  // button keeps its label (money-03), and truncates inside the bar items.
  const barTitleRef = useRef<View>(null);
  const barTitle = useTitleOnScroll(barTitleRef, lead?.comparison.heading, {
    trailing: 1,
  });
  return (
    <>
      <RouteOptions
        stableItems
        options={{
          title: lead?.comparison.heading ?? '',
          ...headerItems(
            lead
              ? pageItems({
                  name: lead.comparison.heading,
                  menu: moneyPageMenu({
                    path: discoverPath({
                      id: lead.id,
                      category: lead.category,
                    }),
                    title: lead.title,
                  }),
                })
              : undefined,
          ),
        }}
      />
      <Screen
        onScroll={barTitle.onScroll}
        testID={lead ? 'lead-screen' : 'lead-pending-screen'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.navy}
          />
        }
      >
        {!discovery ? (
          error ? (
            offline ? (
              <ContentUnavailable
                symbol="wifi.slash"
                title={copy.notSaved}
                body={copy.notSavedBody}
                testID="lead-error"
              />
            ) : (
              <ContentUnavailable
                symbol="exclamationmark.triangle"
                title="This lead couldn’t be loaded"
                body="Check your connection and try again."
                action={{ label: copy.tryAgain, onPress: retry }}
                testID="lead-error"
              />
            )
          ) : (
            <Group testID="lead-loading">
              <Skeleton shape="rows" count={2} label="Loading the lead" />
              <Skeleton shape="figure" count={1} />
              <Skeleton shape="rows" count={5} />
            </Group>
          )
        ) : !lead || !comparison || !source ? (
          <ContentUnavailable
            symbol="magnifyingglass"
            title="This lead is no longer listed"
            action={{
              label: 'See all leads',
              onPress: () => router.navigate(leadsRoute),
            }}
            testID="lead-missing"
          />
        ) : (
          <>
            {record?.stale && record.staleReason !== 'unreadable' ? (
              <OfflineLine savedAt={record.savedAt} />
            ) : null}
            <Group gap={rhythm.tight}>
              <Text wordSafe variant="secondary" testID="lead-meta">
                Lead · {lead.categoryLabel}
              </Text>
              <View
                ref={barTitleRef}
                collapsable={false}
                onLayout={barTitle.onTitleLayout}
              >
                <Heading level={1} kind="page" testID="lead-heading">
                  {comparison.heading}
                </Heading>
              </View>
              <Text wordSafe variant="body" testID="lead-takeaway">
                {comparison.takeaway}
              </Text>
            </Group>
            {subject ? (
              <LinkRow
                title={subject.title}
                detail={subject.detail}
                leading={
                  subject.party ? <PartyDot party={subject.title} /> : undefined
                }
                symbol={
                  subject.party || subject.detail ? undefined : 'building.2'
                }
                href={subject.href}
                testID="lead-subject"
              />
            ) : null}
            {comparison.type === 'concentration' ? (
              <View testID="lead-comparison" style={styles.section}>
                <SectionHeader title={comparison.chartTitle} />
                <FigureBlock
                  value={formatMoneyCompact(comparison.total)}
                  ink="money"
                  label={comparison.figureLabel}
                  accessibilityLabel={`${moneyAccessibilityLabel(comparison.total, true)}, ${comparison.figureLabel}`}
                  citation={source}
                  testID="lead-total"
                />
                <ConcentrationChart
                  comparison={comparison}
                  testID="lead-chart"
                />
              </View>
            ) : (
              <View testID="lead-flows" style={styles.section}>
                <StatStrip
                  tiles={[
                    {
                      value: formatMoneyCompact(comparison.receipts.value),
                      label: `in ${formatCount(comparison.receipts.records)} party ${comparison.receipts.records === 1 ? 'receipt' : 'receipts'}`,
                      ink: 'money',
                      testID: 'lead-flows-receipts',
                    },
                    {
                      value: formatMoneyCompact(comparison.contracts.value),
                      label: `in ${formatCount(comparison.contracts.records)} government ${comparison.contracts.records === 1 ? 'contract' : 'contracts'}`,
                      testID: 'lead-flows-contracts',
                    },
                  ]}
                />
                <Text wordSafe variant="footnote" testID="lead-flows-caveat">
                  Shown beside each other, never added together.
                </Text>
                <SourceLine {...source} />
              </View>
            )}
            <View testID="lead-method" style={styles.section}>
              <SectionHeader title="How this lead was found" />
              <Text wordSafe variant="body" testID="lead-note">
                {comparison.note}
              </Text>
              {lead.caveats.length ? (
                <View style={styles.caveats}>
                  {lead.caveats.map((caveat, index) => (
                    <View key={index} style={styles.caveat}>
                      <View
                        style={styles.dot}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      />
                      <Text
                        wordSafe
                        variant="body"
                        testID={`lead-caveat-${index}`}
                        style={styles.grow}
                      >
                        {plainCaveat(caveat)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            {lead.evidence.length ? (
              <Section title="Example records" testID="lead-evidence">
                <View>
                  {lead.evidence.map((item, index) => {
                    const row = evidenceRow(item);
                    const resolved = evidenceRecord(item);
                    const href = resolved
                      ? moneyItemRoute(
                          {
                            kind: 'evidence',
                            lead: lead.id,
                            i: String(index),
                          },
                          resolved.name,
                        )
                      : undefined;
                    return row ? (
                      <MoneyRow
                        key={index}
                        name={row.name}
                        detail={row.detail || undefined}
                        amount={row.amount}
                        href={href}
                        testID={`lead-evidence-${index}`}
                      />
                    ) : (
                      <LinkRow
                        key={index}
                        title={item.register}
                        detail={item.record ?? undefined}
                        href={href}
                        accessory="none"
                        testID={`lead-evidence-${index}`}
                      />
                    );
                  })}
                </View>
              </Section>
            ) : null}
            {mapRow ? (
              <LinkRow
                title="Open in the money map"
                symbol={symbols.money}
                href={mapRow}
                testID="lead-money-map"
              />
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: rhythm.tight },
  caveats: { gap: rhythm.tight },
  caveat: { flexDirection: 'row', gap: rhythm.tight, alignItems: 'flex-start' },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    borderCurve: 'continuous',
    marginTop: 10,
    backgroundColor: colors.inkSoft,
  },
  grow: { flex: 1 },
});
