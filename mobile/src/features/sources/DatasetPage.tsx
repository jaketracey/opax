import { useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import {
  ContentUnavailable,
  Heading,
  InlineError,
  InsetGroup,
  LinkRow,
  Screen,
  Skeleton,
  SourceLine,
  Text,
  ValueRow,
} from '../../design/primitives';
import { copy } from '../../design/copy';
import { symbols } from '../../design/symbols';
import { chrome, rhythm } from '../../design/tokens';
import { licenceHubRoute } from '../../navigation/routes/reference';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import type { Dataset, DatasetLink } from './datasets';
import { sourcesHrefs, useSourcesBase } from './base';
import { hasOwnDate, loadedAdditions, useOwnDates, useSources } from './loader';
import { sourcesCopy as text } from './parts';

/**
 * Creative Commons still publishes some licence links as http; they are
 * served over https. Only https originals open, each once.
 */
export function originalsOf(dataset: Dataset): DatasetLink[] {
  const secure = dataset.links.map((link) => ({
    ...link,
    url: link.url.replace(
      /^http:\/\/creativecommons\.org\//,
      'https://creativecommons.org/',
    ),
  }));
  return secure.filter(
    (link, index) =>
      link.url.startsWith('https://') &&
      secure.findIndex((other) => other.url === link.url) === index,
  );
}

/**
 * One dataset (account.md 4.4): its name and publisher, a dated source line,
 * the licence when it is verified, the terms, and its originals as rows.
 * Pushed from Datasets in either sheet, or the Licence sheet's root, where a
 * foot row pushes Sources and licences inside the same sheet. An id that is
 * not listed once the loaded datasets settle says so, and "All datasets"
 * replaces the page so Back never returns to it. A dataset added from a read
 * that failed is not missing: its page says the details couldn't be loaded.
 */
export function DatasetPage({
  id,
  licenceRoot = false,
}: {
  id: string;
  /** The Licence sheet's root: draws the foot row to the hub. */
  licenceRoot?: boolean;
}) {
  const href = sourcesHrefs(useSourcesBase());
  const sources = useSources();
  const { list, loaded, settled, refreshing } = sources;
  // Its own date only, never the whole set (the Licence sheet's root).
  const [request, setRequest] = useState(0);
  const own = useOwnDates([id], request);
  const refresh = () => {
    sources.refresh();
    setRequest((n) => n + 1);
  };
  const dataset = list.find((item) => item.id === id);
  const dated = settled && (!hasOwnDate(id) || id in own);
  const titleRef = useRef<View>(null);
  const bar = useTitleOnScroll(titleRef, dataset?.name);
  const unread =
    (loadedAdditions as readonly string[]).includes(id) &&
    !!loaded?.partial.has(id);
  if (!dataset)
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <Screen grouped testID="sources-dataset-screen">
          {!settled ? (
            <Skeleton
              shape="text"
              count={3}
              onSunken
              label={text.loadingTerms}
            />
          ) : loaded?.offline ? (
            <ContentUnavailable
              symbol={symbols.offline}
              title={copy.notSaved}
              body={copy.notSavedBody}
              testID="sources-dataset-missing"
            />
          ) : unread ? (
            <InlineError
              subject={text.datasets}
              message={text.partial}
              onRetry={refresh}
              testID="sources-dataset-partial"
            />
          ) : (
            <ContentUnavailable
              symbol={symbols.source}
              title={text.missingTitle}
              body={text.missingBody}
              action={{
                label: text.allDatasets,
                onPress: () => router.replace(href.datasets),
                testID: 'sources-dataset-all',
              }}
              testID="sources-dataset-missing"
            />
          )}
        </Screen>
      </>
    );
  const originals = originalsOf(dataset);
  const partial = !!loaded?.partial.has(dataset.id);
  return (
    <Screen
      grouped
      testID="sources-dataset-screen"
      onScroll={bar.onScroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={chrome.tint}
        />
      }
    >
      <View style={styles.head}>
        <View ref={titleRef} onLayout={bar.onTitleLayout} style={styles.titles}>
          <Heading level={1} kind="page" testID="source-dataset-title">
            {dataset.name}
          </Heading>
          <Text wordSafe variant="secondary">
            {dataset.publisher}
          </Text>
        </View>
        {dated ? (
          <SourceLine
            asOf={dataset.asOf ?? own[id] ?? null}
            citation={dataset.publisher.split('; ')}
            originals={originals}
            testID={`sources-dataset-${dataset.id}-source`}
          />
        ) : null}
      </View>
      {dataset.licence ? (
        <InsetGroup>
          <ValueRow
            label={text.licence}
            value={dataset.licence}
            testID={`sources-dataset-${dataset.id}-licence`}
          />
        </InsetGroup>
      ) : null}
      <View style={styles.terms} testID={`sources-dataset-${dataset.id}-terms`}>
        {dataset.terms.map((term) => (
          <Text key={term} wordSafe variant="body">
            {term}
          </Text>
        ))}
        {partial ? (
          <InlineError
            subject={dataset.name}
            message={text.partial}
            onRetry={refresh}
            testID="sources-dataset-partial"
          />
        ) : null}
      </View>
      {originals.length ? (
        <InsetGroup
          header={text.originals}
          testID={`sources-dataset-${dataset.id}-originals`}
        >
          {originals.map((link) => (
            <LinkRow
              key={link.url}
              title={link.label}
              external={{ url: link.url, label: link.label }}
            />
          ))}
        </InsetGroup>
      ) : null}
      {licenceRoot ? (
        <InsetGroup>
          <LinkRow
            title={text.title}
            href={licenceHubRoute}
            testID="licence-sources"
          />
        </InsetGroup>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: rhythm.group },
  titles: { gap: rhythm.line },
  terms: { gap: rhythm.tight },
});
