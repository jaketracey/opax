import { headerItems } from '../../navigation/chrome';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  AsAtLine,
  Button,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  LoadingState,
  Section,
  Disclosure,
  LinkRow,
  RowList,
  ViewOriginal,
  Text,
  errorMessage,
} from '../../design/primitives';
import { colors, radius, rhythm } from '../../design/tokens';
import { formatCount, formatDate } from '../../design/format';
import { catalogs } from '../../api/runtime';
import { Bullet, MachineSummary } from '../bills/parts';
import { billRoute } from '../../navigation/routes';
import { shareHeaderItem } from '../../navigation/share';
import { records } from './runtime';
import { textChunks } from './model';
import { ReaderList } from './ReaderList';
import { shareTextFile } from './actions';
import { useRead } from './useRead';
export default function BillTextReader({
  recordKey,
  embedded = false,
}: { recordKey?: string; embedded?: boolean } = {}) {
  const params = useLocalSearchParams<{ key: string; version?: string }>();
  const key = recordKey ?? params.key ?? '',
    version = params.version;
  const load = useCallback(() => records.billManifest(key), [key]);
  const manifestState = useRead(load);
  const manifest = manifestState.value?.data;
  // The bill page's own "In short": same record, same label. A bill without
  // one (or a read that fails) shows the reading actions and nothing else.
  const loadSummary = useCallback(() => catalogs.billFor(key), [key]);
  const summaryState = useRead(loadSummary);
  const summarySettled = !!(summaryState.value || summaryState.error);
  const summary = summaryState.value?.data.summary.data ?? null;
  const changes = summary?.changes.filter(Boolean) ?? [];
  const [chosen, setChosen] = useState<{ key: string; id: string } | null>(
    null,
  );
  const id =
    (chosen?.key === key ? chosen.id : null) ??
    (manifest?.versions.some((row) => row.id === version)
      ? version
      : manifest?.default_version_id);
  const requestedId = chosen?.key === key ? chosen.id : null;
  const shown = manifest?.versions.find((row) => row.id === id);
  const loadVersion = useCallback(
    () =>
      requestedId
        ? records.billVersion(key, requestedId)
        : Promise.resolve(null),
    [key, requestedId],
  );
  const versionState = useRead(loadVersion);
  const doc = versionState.value?.data;
  const [picker, setPicker] = useState(false),
    [navigation, setNavigation] = useState(false),
    [supporting, setSupporting] = useState(false);
  const [jumpTo, setJump] = useState<{ index: number; attempt: number } | null>(
    null,
  );
  // Previous bytes must never be presented as the newly chosen version.
  const current = doc?.version.id === id ? doc : null;
  useEffect(() => {
    if (current)
      AccessibilityInfo.announceForAccessibility(
        `Loaded ${current.version.stage_label}`,
      );
  }, [current]);
  const parts = useMemo(
    () =>
      current?.sections.flatMap((section) =>
        textChunks(section.text).map((text, index) => ({
          id: `${section.id}-${index}`,
          text,
          ...(index === 0 ? { title: section.title } : {}),
        })),
      ) ?? [],
    [current],
  );
  const jump = (sectionId: string) => {
    const index = parts.findIndex((part) => part.id === `${sectionId}-0`);
    if (index >= 0) {
      setNavigation(false);
      setJump((old) => ({ index, attempt: (old?.attempt ?? 0) + 1 }));
    }
  };
  return (
    <>
      {embedded ? null : (
        <Stack.Screen
          options={{
            title: 'Bill text',
            headerTitle: '',
            ...headerItems(
              manifest
                ? () => [
                    shareHeaderItem({
                      path: `/bill/${key}`,
                      anchor: 'bill-full-text',
                      title: manifest.title,
                    }),
                  ]
                : undefined,
            ),
          }}
        />
      )}
      <ReaderList
        testID="bill-text-reader"
        parts={parts}
        jumpTo={jumpTo}
        header={
          <>
            {manifestState.error ? (
              <>
                <Heading level={1}>Bill text</Heading>
                <ErrorState
                  message={errorMessage(manifestState.error)}
                  onRetry={manifestState.retry}
                  testID="bill-text-error"
                />
              </>
            ) : !manifest || !summarySettled ? (
              <>
                <Heading level={1}>Bill text</Heading>
                <LoadingState label="Loading collected versions" />
              </>
            ) : (
              <>
                <Group gap={rhythm.tight} testID="bill-text-head">
                  <Text variant="kicker" tone="billsInk">
                    Bill text
                  </Text>
                  <Heading level={1} testID="bill-text-title">
                    {manifest.title}
                  </Heading>
                  <AsAtLine
                    asOf={manifest.generated_at}
                    citation="Collected original bill texts"
                  />
                </Group>
                {summary ? (
                  <Section
                    title="In short"
                    accent="bills"
                    testID="bill-text-summary"
                  >
                    <MachineSummary
                      attribution={summary.attribution}
                      sentences={summary.sentences}
                      testID="bill-text-summary"
                    />
                    {changes.length ? (
                      <Disclosure
                        label="What it changes"
                        value={formatCount(changes.length)}
                        testID="bill-text-changes"
                      >
                        <Group gap={rhythm.tight}>
                          {changes.map((change, index) => (
                            <Bullet key={index}>{change}</Bullet>
                          ))}
                        </Group>
                      </Disclosure>
                    ) : null}
                  </Section>
                ) : null}
                <Section
                  title="Read the bill"
                  accent="bills"
                  testID="bill-text-version"
                  info={{
                    title: 'About collected versions',
                    notes: [manifest.coverage_note],
                    testID: 'bill-text-coverage-info',
                  }}
                >
                  <View style={styles.version}>
                    <Text variant="kicker" tone="billsInk">
                      Version
                    </Text>
                    <Text
                      variant="strong"
                      wordSafe
                      testID="bill-text-version-label"
                    >
                      {shown?.stage_label}
                    </Text>
                    {shown?.date ? (
                      <Text variant="metadata">{formatDate(shown.date)}</Text>
                    ) : null}
                  </View>
                  <RowList>
                    {manifest.versions.length > 1 ? (
                      <Disclosure
                        label="Choose version"
                        value={formatCount(manifest.versions.length)}
                        accessibilityLabel={`Choose version, ${formatCount(manifest.versions.length)} collected`}
                        open={picker}
                        onToggle={setPicker}
                        testID="bill-text-version-picker"
                      >
                        <RowList>
                          {manifest.versions.map((row, index) => (
                            <LinkRow
                              key={row.id}
                              title={row.stage_label}
                              detail={
                                row.date ? formatDate(row.date) : undefined
                              }
                              onPress={() => {
                                setChosen({ key, id: row.id });
                                setPicker(false);
                                setSupporting(false);
                                setJump(null);
                              }}
                              testID={`bill-text-version-${index}`}
                            />
                          ))}
                        </RowList>
                      </Disclosure>
                    ) : null}
                    {!requestedId ? (
                      <LinkRow
                        title="Read full bill text"
                        icon="doc.text"
                        accent="bills"
                        onPress={() => {
                          if (id) setChosen({ key, id });
                        }}
                        testID="bill-text-read"
                      />
                    ) : null}
                    <LinkRow
                      title="Bill page"
                      detail="Dates, divisions and speeches"
                      icon="building.columns"
                      accent="bills"
                      onPress={() => router.push(billRoute(key))}
                      testID="bill-text-bill-page"
                    />
                  </RowList>
                </Section>
                {!requestedId ? null : versionState.error ? (
                  <ErrorState
                    message={errorMessage(versionState.error)}
                    onRetry={versionState.retry}
                    testID="bill-text-version-error"
                  />
                ) : !current ? (
                  <LoadingState label="Loading this bill text version" />
                ) : (
                  <>
                    <Group gap={rhythm.tight}>
                      <ViewOriginal
                        sources={[
                          {
                            label: 'Original bill document',
                            url: current.version.source_url,
                          },
                        ]}
                        testID="bill-text-source"
                      />
                      <AsAtLine
                        asOf={current.version.date}
                        citation="Original bill document"
                      />
                    </Group>
                    {current.enrichment ? (
                      <Section
                        title="In this version"
                        accent="bills"
                        testID="bill-text-overview"
                        info={{
                          title: 'About this overview',
                          notes: [
                            'AI overview of selected provisions in this version. Read the full text for all proposed changes.',
                          ],
                          testID: 'bill-text-overview-info',
                        }}
                      >
                        <Text
                          variant="caption"
                          testID="bill-text-overview-label"
                        >
                          AI overview of selected provisions in this version.
                        </Text>
                        <Text selectable>{current.enrichment.brief}</Text>
                        <Disclosure
                          label="Supporting passages"
                          open={supporting}
                          onToggle={setSupporting}
                        >
                          {current.enrichment.evidence.map((row, index) => (
                            <Group key={index}>
                              <Text selectable>{row.quote}</Text>
                              <LinkRow
                                title="Read this section"
                                onPress={() => jump(row.section_id)}
                              />
                            </Group>
                          ))}
                        </Disclosure>
                      </Section>
                    ) : (
                      <Text variant="fine">
                        No overview is available for this version.
                      </Text>
                    )}
                    <Button
                      variant="quiet"
                      size="compact"
                      icon="square.and.arrow.up"
                      label="Download displayed text"
                      onPress={() => {
                        void shareTextFile(
                          current.text,
                          `${key}-${current.version.id}.txt`,
                        );
                      }}
                      testID="bill-text-download"
                    />
                    <Disclosure
                      label="Jump to section or page"
                      icon="list.bullet"
                      accent="bills"
                      open={navigation}
                      onToggle={setNavigation}
                      testID="bill-text-navigation"
                    >
                      <RowList>
                        {current.sections.map((section, index) => (
                          <LinkRow
                            key={section.id}
                            title={section.title}
                            onPress={() => jump(section.id)}
                            testID={`bill-text-section-${index}`}
                          />
                        ))}
                      </RowList>
                    </Disclosure>
                    <Section
                      title="Full text"
                      accent="bills"
                      info={{
                        title: 'About this text',
                        notes: [
                          'Published bill text, transcribed from the original document. Check the original for authoritative formatting.',
                        ],
                        testID: 'bill-text-info',
                      }}
                    >
                      {null}
                    </Section>
                    {!current.text ? (
                      <EmptyState message="No text is available for this version." />
                    ) : null}
                  </>
                )}
              </>
            )}
          </>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  version: {
    gap: rhythm.line,
    backgroundColor: colors.billsWash,
    borderRadius: radius,
    paddingHorizontal: rhythm.block,
    paddingVertical: rhythm.heading,
  },
});
