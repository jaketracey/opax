import { useRef } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import {
  ContentUnavailable,
  Heading,
  InlineError,
  InsetGroup,
  LinkRow,
  Screen,
  ScreenHeader,
  Skeleton,
  SourceLine,
  ValueRow,
} from '../../design/primitives';
import { copy } from '../../design/copy';
import { formatCount } from '../../design/format';
import { symbols } from '../../design/symbols';
import { chrome, rhythm } from '../../design/tokens';
import { methodsRoute } from '../../navigation/routes/reference';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { coverageCopy as text } from './copy';
import {
  coverageSources,
  kindRows,
  parliamentRows,
  reference,
  type CountRow,
  type Counts as CountsRecord,
} from './repository';
import { useRead, useShareItem, type Read } from './read';
import type { Corpus } from '../../api/catalog-decoders';

/**
 * Coverage (records.md 7): what OPAX holds, by source first (the question
 * people bring: does it cover my state, and from when?), then the live
 * counts by kind and by parliament. No headline figure: About carries the
 * one headline count. Every count is through formatCount, every section ends
 * on its own dated source line, and Methods is one row in its own group.
 */
export default function Coverage() {
  const summary = useRead(reference.summary);
  const counts = useRead(reference.counts);
  useShareItem({ path: '/stats', title: text.title });
  const titleRef = useRef<View>(null);
  const bar = useTitleOnScroll(titleRef, text.title);
  const refresh = () => {
    summary.refresh();
    // The counts are a paid read: a pull draws the session's answer again,
    // and only a failed read asks for a new one.
    if (counts.error) counts.retry();
  };
  const failed =
    !!summary.error && !summary.record && !!counts.error && !counts.record;
  const saved = [summary.record, counts.record].find((r) => r?.stale);
  return (
    <Screen
      grouped
      testID="coverage-screen"
      onScroll={bar.onScroll}
      offline={saved ? { savedAt: saved.savedAt } : null}
      refreshControl={
        <RefreshControl
          refreshing={summary.refreshing}
          onRefresh={refresh}
          tintColor={chrome.tint}
        />
      }
    >
      <ScreenHeader>
        <View ref={titleRef} onLayout={bar.onTitleLayout}>
          <Heading level={1} kind="page" testID="coverage-title">
            {text.title}
          </Heading>
        </View>
      </ScreenHeader>
      {failed ? (
        <ContentUnavailable
          symbol={symbols.error}
          title={text.pageError}
          action={{
            label: copy.tryAgain,
            onPress: () => {
              summary.retry();
              counts.retry();
            },
          }}
          testID="coverage-unavailable"
        />
      ) : (
        <>
          <BySource read={summary} />
          <Counts read={counts} />
        </>
      )}
      <InsetGroup>
        <LinkRow
          title={text.methodsRow}
          href={methodsRoute}
          testID="coverage-methods"
        />
      </InsetGroup>
    </Screen>
  );
}

function BySource({ read }: { read: Read<Corpus> }) {
  if (!read.record)
    return read.error ? (
      <InlineError
        subject={text.title}
        message={text.sourcesError}
        onRetry={read.retry}
        testID="coverage-sources-error"
      />
    ) : (
      <Skeleton
        count={6}
        onSunken
        label={text.loadingSources}
        testID="coverage-sources-loading"
      />
    );
  const record = read.record;
  const sources = coverageSources(record.data);
  if (!sources.length) return null;
  return (
    <View testID="coverage-sources" style={styles.block}>
      <InsetGroup header={text.bySource}>
        {sources.map((source) => (
          <LinkRow
            key={source.name}
            title={source.name}
            detail={source.detail}
            value={source.window}
            valueEmphasis
            accessory="none"
          />
        ))}
      </InsetGroup>
      <SourceLine
        asOf={record.data.version}
        citation={text.summaryCitation}
        savedAt={record.stale ? record.savedAt : null}
        state={record.partial && !record.stale ? 'partial' : null}
        originals={[{ label: text.summaryCitation, url: '/corpus.json' }]}
        notes={[
          record.data.inclusion,
          text.holdsNote,
          record.partial ? copy.partialNote : null,
        ]}
        testID="coverage-sources-source"
      />
    </View>
  );
}
function Counts({ read }: { read: Read<CountsRecord> }) {
  if (!read.record)
    return read.error ? (
      <InlineError
        subject={text.title}
        message={text.countsError}
        onRetry={read.retry}
        testID="coverage-counts-error"
      />
    ) : (
      <View style={styles.block} testID="coverage-counts-loading">
        <Skeleton count={5} onSunken label={text.loadingCounts} />
        <Skeleton count={5} onSunken label={text.loadingCounts} />
      </View>
    );
  const record = read.record;
  const kinds = kindRows(record.data);
  const parliaments = parliamentRows(record.data);
  if (!kinds?.length && !parliaments?.length) return null;
  const partial = !kinds?.length || !parliaments?.length;
  return (
    <View testID="coverage-counts" style={styles.block}>
      {kinds?.length ? (
        <Rows header={text.kinds} rows={kinds} testID="coverage-kinds" />
      ) : null}
      {parliaments?.length ? (
        <Rows
          header={text.parliaments}
          rows={parliaments}
          testID="coverage-parliaments"
        />
      ) : null}
      <SourceLine
        asOf={record.asOf ?? record.savedAt}
        citation={text.countsCitation}
        savedAt={record.stale ? record.savedAt : null}
        state={partial && !record.stale ? 'partial' : null}
        notes={[text.countsNote, partial ? copy.partialNote : null]}
        testID="coverage-counts-source"
      />
    </View>
  );
}

function Rows({
  header,
  rows,
  testID,
}: {
  header: string;
  rows: CountRow[];
  testID: string;
}) {
  return (
    <InsetGroup header={header} testID={testID}>
      {rows.map((row) => (
        <ValueRow
          key={row.label}
          label={row.label}
          value={formatCount(row.value)}
        />
      ))}
    </InsetGroup>
  );
}

const styles = StyleSheet.create({
  block: { gap: rhythm.group },
});
