import { useEffect, useState } from 'react';
import { catalogs } from '../../api/runtime';
import type { Block, EditionView } from '../../api/selectors';
import { editionTitles } from '../../api/selectors';
import { sponsorSlug } from '../bills/sponsors';
import type { SourceOriginal } from '../../design/source';
import { ApiError } from '../../api/errors';
import { billSourceLabel } from '../../api/bill-transforms';

export function useEdition() {
  const [block, setBlock] = useState<Block<EditionView> | null>(null);
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let active = true;
    void catalogs
      .todayEdition(revision > 0)
      .catch(
        (error: unknown): Block<EditionView> => ({
          status: 'error',
          data: null,
          asAt: null,
          sources: [],
          stale: false,
          savedAt: null,
          error:
            error instanceof ApiError
              ? error
              : new ApiError(
                  'invalid-data',
                  'The daily edition could not be read.',
                ),
        }),
      )
      .then((next) => {
        // An authoritative absence must replace even the saved copy in a mounted reader.
        if (active) {
          setBlock(next);
          setRefreshing(false);
        }
      });
    return () => {
      active = false;
    };
  }, [revision]);
  return {
    block,
    refreshing,
    refresh: () => {
      setRefreshing(true);
      setRevision((n) => n + 1);
    },
  };
}

/** Small cached indices only. Never load the directory to make a person row work. */
export function useEditionSubject(edition: EditionView | null) {
  const [metadata, setMetadata] = useState<{
    edition: EditionView;
    titles?: ReturnType<typeof editionTitles>;
    slug?: string;
    originals?: SourceOriginal[];
  } | null>(null);
  useEffect(() => {
    if (!edition) return;
    let active = true;
    if (edition.kind === 'bill') {
      void catalogs
        .bills()
        .then((record) => {
          if (active)
            setMetadata((old) => ({
              ...(old?.edition === edition ? old : {}),
              edition,
              titles: editionTitles(edition, record.data),
            }));
        })
        .catch(() => {});
      const key = /^\/bill\/([^/?]+)/.exec(edition.path)?.[1];
      if (key)
        void catalogs
          .bill(key)
          .then((record) => {
            const originals = record.data.sources.map((source) => ({
              label: billSourceLabel(source.kind),
              url: source.url,
              asOf: source.document_date,
            }));
            if (active)
              setMetadata((old) => ({
                ...(old?.edition === edition ? old : {}),
                edition,
                originals,
              }));
          })
          .catch(() => {});
    } else if (edition.kind === 'politician') {
      void Promise.all([catalogs.roster(), catalogs.slugs()])
        .then(([roster, slugs]) => {
          const slug =
            sponsorSlug(edition.title, roster.data, slugs.data) ?? undefined;
          if (active) setMetadata({ edition, slug });
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [edition]);
  const current = metadata?.edition === edition ? metadata : null;
  return {
    edition:
      edition && current?.titles ? { ...edition, ...current.titles } : edition,
    slug: current?.slug,
    originals: current?.originals,
  };
}
