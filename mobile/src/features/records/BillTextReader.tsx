import { LoadingStatus } from '../../design/states';
import { RouteOptions } from '../../navigation/preview';
import { SectionHeader } from '../../design/layout';
import {
  headerItems,
  pageMenu,
  type TestableHeaderItem,
} from '../../navigation/chrome';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackHeaderItem } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { NavigationContext } from 'expo-router/react-navigation';
import {
  Button,
  Disclosure,
  Heading,
  InlineError,
  LinkRow,
  MachinePill,
  PageFoot,
  SourceLine,
  Text,
  menuLeaves,
  type RowMenuLeaf,
} from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';
import { formatCount, formatDate } from '../../design/format';
import { haptic } from '../../design/haptics';
import { symbols } from '../../design/symbols';
import { catalogs } from '../../api/runtime';
import { billTextContentsRoute } from '../../navigation/routes';
import { canonicalUrl, openSource } from '../../navigation/external';
import { canShare, shareRecord } from '../../navigation/share';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useBillNavigation } from '../bills/navigation';
import { useOpenAsk } from '../ask/open';
import { records } from './runtime';
import {
  firstSentences,
  shortStage,
  stageText,
  textChunks,
  type BillTextVersion,
} from './model';
import { ReaderList, readerChunkTarget } from './ReaderList';
import { copyText, shareTextFile } from './actions';
import { useRead } from './useRead';
import { RecordLoadError } from './RecordLoadError';
import { subscribeContents } from './contentsChannel';
import { setBillTextPane } from './billTextPane';
import { Bullet } from '../bills/parts';

/** First paint waits this long after the version for the bill's summary. */
const SUMMARY_WINDOW = 400;

/** "As passed by both houses, 18 Sep 2026": a version as the menu says it. */
const versionLabel = (version: BillTextVersion) =>
  [
    stageText(version.stage_label),
    version.date ? formatDate(version.date, 'short') : null,
  ]
    .filter(Boolean)
    .join(', ');

/**
 * The bill's own words (records.md 4): opens on the default (or requested)
 * version's text, with In short above it when the bill page's summary
 * arrives in time. Version stays a bar menu. On iPhone, Contents becomes
 * More's first item, the records.md 4.2 fallback for a crowded bar.
 */
export default function BillTextReader({
  recordKey,
  embedded = false,
}: { recordKey?: string; embedded?: boolean } = {}) {
  const params = useLocalSearchParams<{ key: string; version?: string }>();
  const key = recordKey ?? params.key ?? '';
  const asked = recordKey ? undefined : params.version;
  const bills = useBillNavigation();
  const openAsk = useOpenAsk();
  const navigation = useContext(NavigationContext);
  const loadManifest = useCallback(
    (signal?: AbortSignal) => records.billManifest(key, signal),
    [key],
  );
  const manifestState = useRead(loadManifest);
  const manifest = manifestState.value?.data;
  const [chosen, setChosen] = useState<{ key: string; id: string } | null>(
    null,
  );
  const id =
    (chosen?.key === key ? chosen.id : null) ??
    (manifest?.versions.some((row) => row.id === asked)
      ? asked
      : manifest?.default_version_id) ??
    null;
  const shown = manifest?.versions.find((row) => row.id === id) ?? null;
  const loadVersion = useCallback(
    (signal?: AbortSignal) =>
      id ? records.billVersion(key, id, signal) : Promise.resolve(null),
    [key, id],
  );
  const versionState = useRead(loadVersion);
  // Previous bytes must never be presented as the newly chosen version.
  const current =
    versionState.value?.data.version.id === id ? versionState.value.data : null;
  // The bill page's summary and short title: read beside the text, drawn
  // only if it arrives within the window, so nothing above the text moves.
  const loadSummary = useCallback(
    (signal?: AbortSignal) => catalogs.billFor(key, undefined, signal),
    [key],
  );
  const summaryState = useRead(loadSummary);
  const summarySettled = !!(summaryState.value || summaryState.error);
  const [late, setLate] = useState<string | null>(null);
  const textArrived = !!current || !!versionState.error;
  useEffect(() => {
    if (!textArrived || summarySettled || late === key) return;
    const timer = setTimeout(() => setLate(key), SUMMARY_WINDOW);
    return () => clearTimeout(timer);
  }, [textArrived, summarySettled, late, key]);
  // First paint decides, once per bill, whether In short is drawn: a
  // summary that comes later waits for the next visit. After first paint a
  // version switch keeps the header; only the text area waits.
  const [painted, setPainted] = useState<{
    key: string;
    summary: boolean;
  } | null>(null);
  const ready =
    !!manifest &&
    (painted?.key === key || (textArrived && (summarySettled || late === key)));
  if (ready && painted?.key !== key)
    setPainted({ key, summary: !!summaryState.value && late !== key });
  const summary =
    painted?.key === key && painted.summary
      ? (summaryState.value?.data.summary.data ?? null)
      : null;
  const shortTitle =
    summaryState.value?.data.identity.data?.shortTitle ?? manifest?.title ?? '';
  const routeTitle = ready ? shortTitle : '';
  const changes = summary?.changes.filter(Boolean) ?? [];
  const [jumpTo, setJump] = useState<{ index: number; attempt: number } | null>(
    null,
  );
  const switched = chosen?.key === key && chosen.id === current?.version.id;
  useEffect(() => {
    if (switched && current)
      AccessibilityInfo.announceForAccessibility(
        `Showing ${stageText(current.version.stage_label)}`,
      );
  }, [switched, current]);
  const parts = useMemo(
    () =>
      current?.sections.flatMap((section) =>
        textChunks(section.text, readerChunkTarget).map((text, index) => ({
          id: `${section.id}-${index}`,
          text,
          ...(index === 0 ? { title: section.title } : {}),
        })),
      ) ?? [],
    [current],
  );
  const jump = useCallback(
    (sectionId: string) => {
      const index = parts.findIndex((part) => part.id === `${sectionId}-0`);
      if (index >= 0)
        setJump((old) => ({ index, attempt: (old?.attempt ?? 0) + 1 }));
    },
    [parts],
  );
  // Contents hands its choice back here, once the sheet has gone.
  useEffect(() => {
    if (!id) return;
    return subscribeContents(key, id, ({ section }) => {
      if (!navigation || navigation.isFocused()) {
        requestAnimationFrame(() => jump(section));
        return;
      }
      const remove = navigation.addListener('focus', () => {
        remove();
        requestAnimationFrame(() => jump(section));
      });
    });
  }, [key, id, jump, navigation]);
  const versions = manifest?.versions ?? [];
  const contents = (current?.sections.length ?? 0) >= 2;
  const android = Platform.OS === 'android';
  const iphoneBar = Platform.OS === 'ios' && !embedded;
  const hasVersionMenu = versions.length > 1 && !!shown;
  const titleRef = useRef<View>(null);
  // The iPhone bar keeps Version and ⋯, with Contents first in More.
  // Reserve the text pill's 120 pt width, not a second 44 pt circle;
  // UIKit can shift the revealed bill title between the bar's groups.
  const title = useTitleOnScroll(
    embedded ? null : titleRef,
    embedded ? undefined : routeTitle,
    {
      trailing: 1 + (hasVersionMenu ? 1 : 0) + (!iphoneBar && contents ? 1 : 0),
      ...(iphoneBar ? { trailingWidth: 44 + (hasVersionMenu ? 120 : 0) } : {}),
    },
  );
  const choose = useCallback(
    (next: string) => {
      if (next === id) return;
      haptic('selection');
      setChosen({ key, id: next });
      setJump(null);
    },
    [id, key],
  );
  const openContents = useCallback(() => {
    if (id) router.push(billTextContentsRoute(key, id));
  }, [key, id]);
  const sharePath = `/bill/${key}${
    id && manifest && id !== manifest.default_version_id
      ? `?text-version=${id}`
      : ''
  }`;
  const share = () =>
    void shareRecord({
      path: sharePath,
      anchor: 'bill-full-text',
      title: shortTitle,
    });
  const ask = () =>
    openAsk(
      { question: `What did parliament say about the ${shortTitle}?` },
      shortTitle,
    );
  const menu: RowMenuLeaf[] = [
    {
      title: 'Bill page',
      symbol: 'doc.text',
      onPress: () => bills.openBill(key, shortTitle),
    },
    {
      title: 'Copy link',
      symbol: 'link',
      onPress: () => {
        void copyText(
          canonicalUrl(sharePath, 'bill-full-text'),
          'Copied link',
        ).then((copied) => {
          if (copied) haptic('success');
        });
      },
    },
    ...(current
      ? [
          {
            title: 'Share as text file',
            symbol: 'square.and.arrow.up' as const,
            onPress: () =>
              void shareTextFile(
                current.text,
                `${key}-${current.version.id}.txt`,
              ),
          },
          {
            title: 'Open original document',
            symbol: 'arrow.up.right.square' as const,
            onPress: () =>
              void openSource(
                current.version.source_url,
                'Original bill document',
              ),
          },
        ]
      : []),
  ];
  const versionItem: Extract<TestableHeaderItem, { type: 'menu' }> | null =
    hasVersionMenu && shown
      ? {
          type: 'menu',
          label: shortStage(shown),
          ...(iphoneBar
            ? { testID: 'bill-text-version', identifier: 'bill-text-version' }
            : {}),
          accessibilityLabel: `Version, ${stageText(shown.stage_label)}${shown.date ? `, ${formatDate(shown.date)}` : ''}`,
          menu: {
            items: versions.map((version) => ({
              type: 'action' as const,
              label: `${android && version.id === id ? '✓ ' : ''}${versionLabel(version)}`,
              state: version.id === id ? ('on' as const) : ('off' as const),
              onPress: () => choose(version.id),
            })),
          },
        }
      : null;
  const barItems = (): NativeStackHeaderItem[] => {
    const more = pageMenu({
      name: 'this bill text',
      items: [
        ...(iphoneBar && contents
          ? [
              {
                title: 'Contents',
                symbol: 'list.bullet' as const,
                onPress: openContents,
              },
            ]
          : []),
        ...menu,
        ...(android ? [{ title: 'Ask about this bill', onPress: ask }] : []),
        ...(canShare
          ? [
              {
                title: 'Share',
                symbol: 'square.and.arrow.up' as const,
                onPress: share,
              },
            ]
          : []),
      ],
    });
    return [
      ...(versionItem ? [versionItem] : []),
      ...(!iphoneBar && contents
        ? [
            {
              type: 'button' as const,
              label: 'Contents',
              accessibilityLabel: 'Contents',
              icon: { type: 'sfSymbol' as const, name: 'list.bullet' as const },
              onPress: openContents,
            },
          ]
        : []),
      // Contents leads More on iPhone; Version always stays in the bar.
      // Ask about this bill is a button after In short, above the text.
      more,
    ];
  };
  // The pane bar draws the same three items (records.md 4.3).
  const paneVersions = versions.map((version) => ({
    id: version.id,
    label: versionLabel(version),
    current: version.id === id,
  }));
  useEffect(() => {
    if (!embedded || !ready) return;
    setBillTextPane(key, {
      version:
        versions.length > 1 && shown
          ? {
              label: shortStage(shown),
              accessibilityLabel: `Version, ${stageText(shown.stage_label)}`,
            }
          : null,
      versions: paneVersions,
      choose,
      contents: contents ? openContents : null,
      menu: menuLeaves(menu),
      title: shortTitle,
      sharePath,
    });
    return () => setBillTextPane(key, null);
    // The menu is rebuilt each render; publish when its inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    embedded,
    ready,
    key,
    id,
    current,
    contents,
    shortTitle,
    versions.length,
  ]);
  const paneRows = embedded || android;
  const askRow = paneRows || Platform.OS === 'ios';
  return (
    <>
      {embedded ? null : (
        <RouteOptions
          stableItems
          options={{
            title: routeTitle,
            ...headerItems(ready ? barItems : undefined),
          }}
        />
      )}
      <ReaderList
        testID="bill-text-reader"
        parts={ready ? parts : []}
        jumpTo={jumpTo}
        onScroll={embedded ? undefined : title.onScroll}
        header={
          manifestState.error ? (
            <RecordLoadError
              error={manifestState.error}
              slug=""
              subject="This bill’s text"
              onRetry={manifestState.retry}
              testID="bill-text-error"
            />
          ) : !ready || !manifest ? (
            <BillTextSkeleton />
          ) : (
            <View testID="bill-text-head">
              <Text
                wordSafe
                variant="secondary"
                testID="bill-text-meta"
                style={styles.meta}
              >
                Bill text
              </Text>
              <View
                ref={titleRef}
                collapsable={false}
                onLayout={embedded ? undefined : title.onTitleLayout}
              >
                <Heading level={1} testID="bill-text-title">
                  {manifest.title}
                </Heading>
              </View>
              {shown ? (
                <Text
                  wordSafe
                  variant="secondary"
                  testID="bill-text-stage"
                  style={styles.stage}
                >
                  {stageText(shown.stage_label)}
                </Text>
              ) : null}
              {summary ? (
                <View style={styles.block} testID="bill-text-summary">
                  <SectionHeader
                    title="In short"
                    level={3}
                    accessory={
                      <MachinePill
                        note={{
                          title: 'Machine-written',
                          body: [summary.attribution],
                        }}
                        testID="bill-text-summary-label"
                      />
                    }
                  />
                  {summary.describes_version ? (
                    <Text
                      wordSafe
                      variant="footnote"
                      tone="inkSoft"
                      testID="bill-text-summary-version"
                    >
                      {`Describes the bill ${summary.describes_version}.`}
                    </Text>
                  ) : null}
                  <View testID="bill-text-summary-text" style={styles.brief}>
                    {firstSentences(summary.sentences).map(
                      (sentence, index) => (
                        <Text key={index} variant="body">
                          {sentence}
                        </Text>
                      ),
                    )}
                  </View>
                  {changes.length ? (
                    <Disclosure
                      label="What it changes"
                      value={formatCount(changes.length)}
                      testID="bill-text-changes"
                    >
                      <View style={styles.brief}>
                        {changes.map((change, index) => (
                          <Bullet key={index}>{change}</Bullet>
                        ))}
                      </View>
                    </Disclosure>
                  ) : null}
                </View>
              ) : null}
              {askRow ? (
                <View style={styles.block}>
                  <Button
                    label="Ask about this bill"
                    variant="primary"
                    symbol={symbols.ask}
                    accessibilityLabel={`Ask about this bill: ${manifest.title}`}
                    accessibilityHint="Opens Ask with a question drafted"
                    onPress={ask}
                    testID="bill-text-ask"
                  />
                </View>
              ) : null}
              {current?.enrichment ? (
                <View style={summary ? undefined : styles.block}>
                  <Disclosure
                    label="Overview of this version"
                    testID="bill-text-overview"
                  >
                    <View style={styles.brief}>
                      <MachinePill
                        note={{
                          title: 'Machine-written',
                          body: [
                            'Written by a model about selected provisions in this version. Read the text for every change.',
                          ],
                        }}
                        testID="bill-text-overview-label"
                      />
                      <Text selectable variant="body">
                        {current.enrichment.brief}
                      </Text>
                      {current.enrichment.evidence.map((row, index) => (
                        <Passage
                          key={index}
                          title={
                            current.sections.find(
                              (section) => section.id === row.section_id,
                            )?.title ?? ''
                          }
                          quote={row.quote}
                          onPress={() => jump(row.section_id)}
                        />
                      ))}
                    </View>
                  </Disclosure>
                </View>
              ) : null}
              {versionState.error ? (
                <View style={styles.block}>
                  <InlineError
                    subject="This version"
                    message="This version couldn’t be loaded."
                    onRetry={versionState.retry}
                    testID="bill-text-version-error"
                  />
                </View>
              ) : null}
              <View style={styles.beforeText} />
              {!current && !versionState.error ? <TextSkeleton /> : null}
            </View>
          )
        }
        footer={
          ready && manifest ? (
            <View>
              {paneRows ? (
                <View style={styles.rows}>
                  <LinkRow
                    title="Bill page"
                    onPress={() => bills.openBill(key, shortTitle)}
                    testID="bill-text-bill-page"
                  />
                </View>
              ) : null}
              <View style={styles.endSource}>
                <VersionSourceLine
                  version={shown}
                  coverage={manifest?.coverage_note ?? null}
                  testID="bill-text-source"
                />
              </View>
              <View style={styles.after}>
                <PageFoot variant="today" />
              </View>
            </View>
          ) : null
        }
      />
    </>
  );
}

/**
 * The version's source line: its own date and the original document, with
 * the collection's coverage note in the sheet (records.md 4.2).
 */
function VersionSourceLine({
  version,
  coverage,
  testID,
}: {
  version: BillTextVersion | null;
  coverage: string | null;
  testID: string;
}) {
  return (
    <SourceLine
      dateRole="recorded"
      asOf={version?.date ?? null}
      citation={[{ label: 'Original bill document' }]}
      originals={
        version
          ? [
              {
                label: 'Original bill document',
                url: version.source_url,
                record: versionLabel(version),
              },
            ]
          : []
      }
      notes={[
        'Published bill text. The original document has the authoritative wording and layout.',
        coverage,
      ]}
      licenceDataset="bills"
      testID={testID}
    />
  );
}

/** A supporting passage: the section's own heading, then the quote. */
function Passage({
  title,
  quote,
  onPress,
}: {
  title: string;
  quote: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Shows this section"
      onPress={onPress}
      style={({ pressed }) => [
        styles.passage,
        pressed ? { backgroundColor: colors.sunken } : null,
      ]}
    >
      {title ? (
        <Text wordSafe variant="rowRecord">
          {title}
        </Text>
      ) : null}
      <Text variant="recordText" numberOfLines={3}>
        {quote}
      </Text>
    </Pressable>
  );
}

/** The text area while a newly chosen version loads. */
function TextSkeleton() {
  return (
    <LoadingStatus
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading this version"
      accessibilityState={{ busy: true }}
      testID="bill-text-version-loading"
      style={styles.brief}
    >
      {Array.from({ length: 8 }, (_, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            { width: index === 7 ? '60%' : '100%', height: 20 },
          ]}
        />
      ))}
    </LoadingStatus>
  );
}

/** The header's final shape, then text lines (records.md 4.3). */
function BillTextSkeleton() {
  const bar = (width: `${number}%`, height: number, key?: number) => (
    <View key={key} style={[styles.bar, { width, height }]} />
  );
  return (
    <LoadingStatus
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading the bill text"
      accessibilityState={{ busy: true }}
      testID="bill-text-loading"
      style={styles.skeleton}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.skeleton}
      >
        {bar('30%', 18)}
        <View style={styles.brief}>
          {bar('100%', 30)}
          {bar('70%', 30)}
        </View>
        {bar('40%', 18)}
        {bar('50%', 16)}
        <View style={styles.brief}>
          {bar('30%', 22)}
          {bar('100%', 20)}
          {bar('100%', 20)}
          {bar('60%', 20)}
        </View>
        <View style={styles.brief}>
          {Array.from({ length: 8 }, (_, index) =>
            bar(index === 7 ? '60%' : '100%', 20, index),
          )}
        </View>
      </View>
    </LoadingStatus>
  );
}

const styles = StyleSheet.create({
  meta: { marginBottom: rhythm.line },
  stage: { marginTop: rhythm.line },
  rows: { marginTop: rhythm.tight },
  block: { marginTop: rhythm.block, gap: rhythm.tight },
  brief: { gap: rhythm.tight },
  beforeText: { height: rhythm.section },
  endSource: { marginTop: rhythm.group },
  after: { marginTop: rhythm.section },
  passage: { gap: rhythm.line, paddingVertical: rhythm.row },
  skeleton: { gap: rhythm.block },
  bar: {
    borderRadius: 4,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
});
