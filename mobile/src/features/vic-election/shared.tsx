import { electionMenu } from './actions';
import type { ReactNode, Ref } from 'react';
import { Animated, SectionList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { RecordResult } from '../../api/client';
import { RegionProvider, SidebarSafe } from '../../design/adaptive';
import { formatDate } from '../../design/format';
import { useScreenColumn } from '../../design/layout';
import { PageFoot } from '../../design/record';
import { LinkRow } from '../../design/rows';
import { SourceLine, type SourceDetails } from '../../design/source';
import { ContentUnavailable, StatePageProvider } from '../../design/states';
import { Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { headerItems, pageItems } from '../../navigation/chrome';
import { vicElectionRoute } from '../../navigation/routes/vic-election';
import { vicCopy as c } from './copy';
import type { Overview } from './decoders';
import { ElectionUnavailable } from './reads';
import { useFloatingBarFoot } from '../../navigation/floating-bar';

export const shortDate = (d: string | number) => formatDate(d, 'short') ?? '';
export const SectionTitle = ({ children }: { children: string }) => (
  <Text wordSafe variant="sectionTitle" accessibilityRole="header">
    {children}
  </Text>
);
export const Block = ({
  title,
  children,
  testID,
}: {
  title?: string;
  children: ReactNode;
  testID?: string;
}) => (
  <View testID={testID} style={{ gap: rhythm.tight }}>
    {title ? <SectionTitle>{title}</SectionTitle> : null}
    {children}
  </View>
);
export function ExternalRow({
  title,
  url,
  testID,
}: {
  title: string;
  url: string;
  testID?: string;
}) {
  return (
    <LinkRow
      testID={testID}
      title={title}
      external
      onPress={() => void openSource(url)}
    />
  );
}
export function ElectionSource({
  record,
  dateLabel,
  ...source
}: SourceDetails & {
  record: RecordResult<unknown>;
  dateLabel?: string | null;
  testID?: string;
}) {
  return (
    <SourceLine
      {...source}
      dateLabel={record.stale ? c.saved(shortDate(record.savedAt)) : dateLabel}
      savedAt={record.stale ? record.savedAt : null}
      state={record.stale ? 'saved' : null}
    />
  );
}
export function OverviewSource({
  record,
  today = false,
}: {
  record: RecordResult<Overview>;
  today?: boolean;
}) {
  const o = record.data;
  return (
    <ElectionSource
      testID={today ? 'today-vic-election-sources' : 'vic-election-sources'}
      record={record}
      asOf={o.updated}
      citation={today ? c.vecSource : [c.vecSource, c.parliament, c.abs]}
      notes={[o.about]}
      originals={[
        { label: c.vec, url: o.sources.election },
        ...(!today
          ? [
              {
                label: c.vecResult(
                  c.contest(o.term_start.slice(0, 4), 'general'),
                ),
                url: o.sources.results,
                record: c.resultsAt(shortDate(o.results_fetched)),
              },
              {
                label: c.roster,
                url: 'https://www.parliament.vic.gov.au/members',
                record: c.asAt(shortDate(o.roster_date)),
              },
              { label: c.abs, url: 'https://www.abs.gov.au/census' },
              { label: c.licence, url: o.sources.licence },
            ]
          : []),
      ]}
    />
  );
}
export function ElectionFoot({ o, testID }: { o?: Overview; testID: string }) {
  return (
    <PageFoot
      variant="authorised"
      line={o?.authorisation}
      corrections={o?.corrections}
      testID={testID}
    />
  );
}
export function About({ o }: { o: Overview }) {
  return (
    <Block>
      <Text wordSafe variant="footnote" tone="inkSoft">
        {c.about(o.about)}
      </Text>
      <ExternalRow title={c.methods} url={o.methods_url} />
    </Block>
  );
}
export function pageOptions(title: string, webURL?: string) {
  return headerItems(
    webURL
      ? pageItems({
          name: title,
          menu: electionMenu(title, webURL),
        })
      : undefined,
  );
}
export function Unavailable({
  error,
  seat = false,
  retry,
}: {
  error: unknown;
  seat?: boolean;
  retry: () => void;
}) {
  const absent = error instanceof ElectionUnavailable;
  const missing = absent && error.reason === 'not_found' && seat;
  return (
    <ContentUnavailable
      testID={seat ? 'vic-seat-missing' : 'vic-election-unavailable'}
      symbol={absent ? 'calendar' : 'exclamationmark.triangle'}
      title={
        missing
          ? c.notFound
          : absent
            ? c.unavailable
            : seat
              ? c.seatFailed
              : c.hubFailed
      }
      body={absent && !missing ? c.unpublished : undefined}
      action={
        missing
          ? {
              label: c.allDistricts,
              onPress: () => router.replace(vicElectionRoute()),
            }
          : absent
            ? undefined
            : { label: c.retry, onPress: retry }
      }
    />
  );
}
export type ElectionSection = {
  key: string;
  title?: string;
  note?: string;
  data: { key: string; element: ReactNode }[];
};
export const item = (key: string, element: ReactNode) => ({ key, element });
/** Plain paper, a single virtualised list in a readable column. */
export function ElectionList({
  sections,
  header,
  footer,
  testID,
  listRef,
  onScroll,
  onLayout,
  arrivalOpacity,
  scrollToOverflowEnabled = false,
}: {
  sections: ElectionSection[];
  header?: ReactNode;
  footer?: ReactNode;
  testID: string;
  listRef?: Ref<
    SectionList<{ key: string; element: ReactNode }, ElectionSection>
  >;
  onScroll?: (y: number) => void;
  onLayout?: () => void;
  arrivalOpacity?: Animated.Value;
  /** iOS: lets scrollToTop reach the rest offset above zero, under the header. */
  scrollToOverflowEnabled?: boolean;
}) {
  const column = useScreenColumn();
  const foot = useFloatingBarFoot();
  return (
    <StatePageProvider>
      <SidebarSafe style={styles.screen}>
        <RegionProvider value={column.inner}>
          <SectionList
            ref={listRef}
            testID={testID}
            style={styles.screen}
            contentContainerStyle={[
              column.content,
              { paddingBottom: rhythm.section },
              foot,
            ]}
            onLayout={(e) => {
              column.onLayout(e);
              onLayout?.();
            }}
            contentInsetAdjustmentBehavior="automatic"
            scrollToOverflowEnabled={scrollToOverflowEnabled}
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            stickySectionHeadersEnabled={false}
            sections={sections}
            keyExtractor={(row) => row.key}
            renderItem={({ item: row }) => (
              <Animated.View
                style={{ paddingBottom: rhythm.tight, opacity: arrivalOpacity }}
              >
                {row.element}
              </Animated.View>
            )}
            renderSectionHeader={({ section }) =>
              section.title ? (
                <Animated.View
                  style={[styles.heading, { opacity: arrivalOpacity }]}
                >
                  <SectionTitle>{section.title}</SectionTitle>
                  {section.note ? (
                    <Text wordSafe variant="footnote" tone="inkSoft">
                      {section.note}
                    </Text>
                  ) : null}
                </Animated.View>
              ) : null
            }
            ListHeaderComponent={
              <View style={{ gap: rhythm.block }}>
                {column.bar}
                {header}
              </View>
            }
            ListFooterComponent={
              <Animated.View
                style={{ gap: rhythm.block, opacity: arrivalOpacity }}
              >
                {footer}
              </Animated.View>
            }
            onScroll={(e) => onScroll?.(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
            removeClippedSubviews={false}
          />
        </RegionProvider>
      </SidebarSafe>
    </StatePageProvider>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  heading: {
    paddingTop: rhythm.section,
    paddingBottom: rhythm.tight,
    gap: rhythm.tight,
  },
});
