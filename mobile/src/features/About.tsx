import { useRef, type ReactNode } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { analyticsEnabled } from '../analytics';
import { copy } from '../design/copy';
import { formatCount } from '../design/format';
import {
  Heading,
  InlineError,
  InsetGroup,
  LinkRow,
  MachinePill,
  Screen,
  ScreenHeader,
  Skeleton,
  SourceLine,
  Text,
} from '../design/primitives';
import { colors, rhythm } from '../design/tokens';
import { coverageRoute } from '../navigation/routes/reference';
import { useTitleOnScroll } from '../navigation/useTitleOnScroll';
import { voiceLinked } from '../voice/linked';
import { AboutHeader } from './about/AboutHeader';
import { aboutCopy as text } from './about/copy';
import { isOffline, useRead } from './methods/read';
import { reference } from './methods/repository';

/**
 * About OPAX (account.md 3): the reading page. Who OPAX is, how it handles
 * your data, how to read its machine text and what it holds. Every row the
 * Account sheet carries (corrections, support, privacy policy, sources,
 * methods) has its one home there; the only row here is Coverage, under the
 * figure it details. Pull to refresh reads the coverage again.
 */
export default function About() {
  const summary = useRead(reference.summary);
  const titleRef = useRef<View>(null);
  const bar = useTitleOnScroll(titleRef, text.barTitle);
  const record = summary.record;
  const offline = record?.stale
    ? { savedAt: record.savedAt }
    : !record && summary.error && isOffline(summary.error)
      ? { savedAt: null }
      : null;
  return (
    <Screen
      grouped
      testID="about-screen"
      onScroll={bar.onScroll}
      offline={offline}
      refreshControl={
        <RefreshControl
          refreshing={summary.refreshing}
          onRefresh={summary.refresh}
          tintColor={colors.navy}
        />
      }
    >
      <ScreenHeader>
        <AboutHeader titleRef={titleRef} onTitleLayout={bar.onTitleLayout} />
      </ScreenHeader>
      <View style={styles.paragraphs}>
        <Text wordSafe variant="body" testID="about-name">
          {text.intro}
        </Text>
        <Text wordSafe variant="body" testID="about-independence">
          {text.independence}
        </Text>
      </View>
      <Block title={text.culturalNotice}>
        <Text wordSafe variant="body" testID="about-deceased-notice">
          {copy.deceasedNotice}
        </Text>
      </Block>
      <Block title={text.privacy} testID="about-privacy-section">
        <Text wordSafe variant="body">
          {text.privacyReading()}
        </Text>
        <Text wordSafe variant="body" testID="about-privacy-device">
          {`${text.privacySearch()} ${text.privacyFollows()}`}
        </Text>
        {analyticsEnabled() ? (
          <Text wordSafe variant="body" testID="about-privacy-usage">
            {text.privacyUsage()}
          </Text>
        ) : null}
        <Text wordSafe variant="body">
          {text.privacyAsk}
        </Text>
        {voiceLinked ? (
          <Text wordSafe variant="body">
            {text.privacyTalk}
          </Text>
        ) : null}
      </Block>
      <Block title={text.machine}>
        {/* The label itself, as a specimen: it does not open its note. */}
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={text.machineExample}
          pointerEvents="none"
          style={styles.specimen}
          testID="about-machine-label"
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <MachinePill note={{ title: copy.machineWritten, body: [] }} />
          </View>
        </View>
        <Text wordSafe variant="body">
          {text.machineText}
        </Text>
      </Block>
      <Block title={text.coverage} testID="about-coverage-section">
        <View style={styles.coverage}>
          {record ? (
            record.data.collected_speeches > 0 ? (
              <>
                <View
                  accessible
                  accessibilityLabel={`${formatCount(record.data.collected_speeches)}, ${text.speeches}`}
                  testID="about-speeches"
                >
                  <Text wordSafe variant="figure">
                    {formatCount(record.data.collected_speeches)}
                  </Text>
                  <Text wordSafe variant="secondary">
                    {text.speeches}
                  </Text>
                </View>
                <SourceLine
                  asOf={record.data.version}
                  citation={text.sourceCitation}
                  savedAt={record.stale ? record.savedAt : null}
                  state={record.partial && !record.stale ? 'partial' : null}
                  originals={[
                    {
                      label: text.sourceOriginal,
                      url: '/corpus.json',
                      asOf: record.data.refresh.checked_at,
                    },
                  ]}
                  notes={[
                    record.data.inclusion,
                    ...record.data.known_defects,
                    text.sourceNote,
                    record.partial ? copy.partialNote : null,
                  ]}
                  testID="about-coverage-as-at"
                />
              </>
            ) : null
          ) : summary.error ? (
            <InlineError
              subject={text.coverage}
              message={text.coverageError}
              onRetry={summary.retry}
              testID="about-coverage-error"
            />
          ) : (
            <Skeleton
              shape="figure"
              count={1}
              onSunken
              label={text.loadingCoverage}
              testID="about-coverage-loading"
            />
          )}
          <InsetGroup>
            <View testID="about-stats">
              <LinkRow
                title={text.coverageRow}
                href={coverageRoute}
                testID="about-coverage"
              />
            </View>
          </InsetGroup>
        </View>
      </Block>
    </Screen>
  );
}

/** A top-level section: its title, then its paragraphs 16 pt apart. */
function Block({
  title,
  children,
  testID,
}: {
  title: string;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.block}>
      <Heading level={2}>{title}</Heading>
      <View style={styles.paragraphs}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: rhythm.heading },
  paragraphs: { gap: rhythm.block },
  coverage: { gap: rhythm.group },
  specimen: { alignSelf: 'flex-start' },
});
