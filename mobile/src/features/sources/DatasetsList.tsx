import { RouteOptions } from '../../navigation/preview';

import { InsetGroup, LinkRow, Screen, Skeleton } from '../../design/primitives';
import { copy } from '../../design/copy';
import { updatedText } from '../../design/source';
import type { Dataset } from './datasets';
import { sourcesHrefs, useSourcesBase } from './base';
import {
  byName,
  hasOwnDate,
  ownDateIds,
  useOwnDates,
  useSources,
} from './loader';
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
 * place; one skeleton row says more are coming. The one screen that reads
 * every dataset's own date: a row shows its publisher alone until its date
 * read settles.
 */
export default function DatasetsList() {
  const href = sourcesHrefs(useSourcesBase());
  const { list, settled } = useSources();
  const own = useOwnDates(ownDateIds());
  const search = useBarSearch(text.searchDatasets);
  const shown = byName(list).filter((dataset) =>
    matches(search.query, [dataset.name, dataset.publisher, dataset.licence]),
  );
  return (
    <>
      <RouteOptions
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
                detail={datasetDetail(
                  { ...dataset, asOf: dataset.asOf ?? own[dataset.id] },
                  settled && (!hasOwnDate(dataset.id) || dataset.id in own),
                )}
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
