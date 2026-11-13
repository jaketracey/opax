import { RouteOptions } from '../../navigation/preview';
import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import type { PartyPageRecord } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import {
  counted,
  disclosureYearNote,
  formatDisclosureYear,
} from '../../design/format';
import { useScreenColumn } from '../../design/layout';
import { MoneyRow } from '../../design/rows';
import {
  ContentUnavailable,
  Skeleton,
  StatePageProvider,
} from '../../design/states';
import { Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';
import { headerItems, pageItems } from '../../navigation/chrome';
import { moneyRecordRoute } from '../../navigation/routes';
import { shareRecord } from '../../navigation/share';
import { presentSource } from '../../navigation/sheets';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { BlockSource } from '../your-mp/Evidence';
import { pageActions } from './PageActions';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Largest sources by year (people.md 0.1, route 17): a party's largest
 * disclosed sources, one sticky group per financial year, up to eight each,
 * with the list's source line and count at its foot.
 */
export default function PartySources() {
  const params = useLocalSearchParams<{ slug?: string; name?: string }>();
  const input = one(params.name) ?? one(params.slug) ?? '';
  const load = useCallback(
    (
      refresh: boolean,
      publish: (record: PartyPageRecord) => void,
      signal?: AbortSignal,
    ) => catalogs.partyPage(input, refresh, publish, signal),
    [input],
  );
  const { record, error, retry } = useCatalogRecord(load);
  const view = record?.data ?? null;
  const label = view?.label ?? input;
  const receipts = view?.receipts;
  const years = receipts?.data?.byYear.filter((y) => y.donors.length) ?? [];
  const sections = years.map((y) => ({
    title:
      y.year === 'undated' ? 'Undated' : formatDisclosureYear(Number(y.year)),
    data: y.donors.slice(0, 8),
  }));
  const webPath = `/subject/party/${encodeURIComponent(label)}`;
  const about = {
    citation: 'AEC disclosure returns',
    asOf: receipts?.asAt ?? null,
    notes: [
      'The largest donor-to-party flows each year, largest first; they are not all of the party’s receipts.',
      disclosureYearNote,
    ],
  };
  const { onLayout, content } = useScreenColumn('readable');
  return (
    <>
      <RouteOptions
        options={{
          title: 'Largest sources by year',
          ...headerItems(
            pageItems({
              name: 'Largest sources by year',
              share: () => void shareRecord({ path: webPath, title: label }),
              menu: pageActions({
                kind: 'party',
                name: label,
                webPath,
                extra: [
                  {
                    title: 'Sources',
                    symbol: 'doc.text.magnifyingglass',
                    onPress: () => presentSource(about),
                  },
                ],
              }),
            }),
          ),
        }}
      />
      {error && !record ? (
        <View style={styles.page} testID="party-sources-screen">
          <ContentUnavailable
            symbol="exclamationmark.triangle"
            title="Couldn’t load largest sources"
            body="Check your connection and try again."
            action={{ label: 'Try again', onPress: retry }}
            testID="party-sources-error"
          />
        </View>
      ) : (
        <StatePageProvider refreshing={false}>
          <SectionList
            testID="party-sources-screen"
            style={styles.page}
            contentInsetAdjustmentBehavior="automatic"
            stickySectionHeadersEnabled
            onLayout={onLayout}
            contentContainerStyle={[styles.content, content]}
            sections={sections}
            keyExtractor={(d, i) => `${d.id}-${i}`}
            renderSectionHeader={({ section }) => (
              <View style={styles.header}>
                <Text wordSafe variant="groupHeader" accessibilityRole="header">
                  {section.title}
                </Text>
              </View>
            )}
            renderItem={({ item, index, section }) => (
              <MoneyRow
                name={item.name}
                detail={item.associated ?? undefined}
                amount={item.amount}
                href={moneyRecordRoute({ node: item.id }, item.name)}
                testID={`party-sources-${section.title}-${index}`}
              />
            )}
            ListEmptyComponent={
              !record || receipts?.status === 'loading' ? (
                <Skeleton
                  shape="rows"
                  count={8}
                  label="Loading largest sources"
                  testID="party-sources-loading"
                />
              ) : receipts?.status === 'error' ? (
                // A failed read is not an empty disclosure record.
                <ContentUnavailable
                  symbol="exclamationmark.triangle"
                  title="Couldn’t load largest sources"
                  body="Check your connection and try again."
                  action={{ label: 'Try again', onPress: retry }}
                  testID="party-sources-error"
                />
              ) : !view ? (
                <ContentUnavailable
                  symbol="person.3"
                  title="This party isn’t in OPAX’s records yet"
                  testID="party-sources-not-found"
                />
              ) : (
                <ContentUnavailable
                  symbol="banknote"
                  title="No sources disclosed"
                  testID="party-sources-empty"
                />
              )
            }
            ListFooterComponent={
              receipts && sections.length ? (
                <View style={styles.foot}>
                  <BlockSource
                    block={receipts}
                    citation={about.citation}
                    notes={about.notes}
                    licenceDataset="aec"
                    testID="party-sources-source"
                  />
                  <Text
                    wordSafe
                    variant="footnote"
                    testID="party-sources-count"
                  >
                    {`${counted(sections.length, 'year', 'years')}`}
                  </Text>
                </View>
              ) : null
            }
          />
        </StatePageProvider>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: { paddingBottom: rhythm.section },
  header: { backgroundColor: colors.paper, paddingVertical: rhythm.tight },
  foot: { paddingTop: rhythm.group, gap: rhythm.line },
});
