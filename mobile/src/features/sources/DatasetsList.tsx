import { Stack } from 'expo-router';
import { InsetGroup, LinkRow, Screen, Skeleton } from '../../design/primitives';
import { copy } from '../../design/copy';
import { updatedText } from '../../design/source';
import type { Dataset } from './datasets';
import { sourcesHrefs, useSourcesBase } from './base';
import { byName, useSources } from './loader';
import {
  matches,
  NoResults,
  paperBar,
  sourcesCopy as text,
  useBarSearch,
} from './parts';

/** "Parliament of Australia · Updated 3 Oct 2026": every row dated. */
export function datasetDetail(dataset: Dataset, settled: boolean): string {
  if (!settled) return dataset.publisher;
  return `${dataset.publisher} · ${updatedText(dataset.asOf) ?? copy.dateNotPublished}`;
}

/**
 * Datasets (account.md 4.3): a long reference list on paper, A to Z, with
 * the bar search field. Datasets that load later take their alphabetical
 * place; one skeleton row says more are coming.
 */
export default function DatasetsList() {
  const href = sourcesHrefs(useSourcesBase());
  const { list, settled } = useSources();
  const search = useBarSearch(text.searchDatasets);
  const shown = byName(list).filter((dataset) =>
    matches(search.query, [dataset.name, dataset.publisher, dataset.licence]),
  );
  return (
    <>
      <Stack.Screen
        options={{
          title: text.datasets,
          headerSearchBarOptions: search.options,
          ...paperBar,
        }}
      />
      <Screen testID="sources-datasets-screen">
        {shown.length ? (
          <InsetGroup testID="sources-datasets-list">
            {shown.map((dataset) => (
              <LinkRow
                key={dataset.id}
                title={dataset.name}
                detail={datasetDetail(dataset, settled)}
                href={href.dataset(dataset.id)}
                testID={`sources-dataset-${dataset.id}`}
              />
            ))}
          </InsetGroup>
        ) : search.query ? (
          <NoResults
            query={search.query}
            body={text.tryPublisher}
            testID="sources-datasets-empty"
          />
        ) : null}
        {!settled && !search.query ? (
          <Skeleton count={1} label={text.loadingMore} />
        ) : null}
      </Screen>
    </>
  );
}
