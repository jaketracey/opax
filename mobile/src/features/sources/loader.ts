import { useCallback, useEffect, useState } from 'react';
import { apiClient, catalogs } from '../../api/runtime';
import { ApiError } from '../../api/errors';
import { sourceName } from '../../design/format';
import { leadRegisters } from '../leads/About';
import { stateOutlineFile } from '../electorate-map/state-suggestion';
import { reference } from '../methods/repository';
import { datasets as base, type Dataset, type DatasetLink } from './datasets';

/** What the catalogue reads add to the bundled datasets. */
export interface Loaded {
  expenses?: { source: string; url: string; licence: string };
  categories?: {
    note: string;
    url: string;
    licenceURL: string;
    definitions: DatasetLink[];
    definitionSources: string[];
  };
  pay?: DatasetLink[];
  release?: { label: string; url: string; licence?: string }[];
  registers?: [string, string][];
  /** Each read's own date, by the dataset it dates. */
  dates: Record<string, string | null>;
  /** Datasets whose extra terms or links could not be read. */
  partial: ReadonlySet<string>;
  /** A read failed because the device is offline. */
  offline: boolean;
}

const offlineError = (e: unknown) =>
  e instanceof ApiError && ['offline', 'timeout'].includes(e.code);
// The record summary dates OPAX's own copy of these publishers' records.
const summarised = [
  'hansard',
  'tvfy',
  'bills',
  'aec',
  'grantconnect',
  'search-catalog',
];

/** Datasets added from a read: when that read fails, the page says so. */
export const loadedAdditions = ['lead-registers', 'release'] as const;

/**
 * A free catalogue file another screen already reads (the money map, grants,
 * agencies, connections, a person's interests and access), read here for its
 * date alone. The cache keeps the raw file, so this small decoder never
 * changes what those screens decode.
 */
const dateOf =
  (...paths: string[][]) =>
  (raw: unknown): string | null => {
    for (const path of paths) {
      let value: unknown = raw;
      for (const key of path)
        value =
          value && typeof value === 'object'
            ? (value as Record<string, unknown>)[key]
            : undefined;
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))
        return value.slice(0, 10);
    }
    return null;
  };
const generated = [['meta', 'generated']];
const dateReads: [ids: string[], path: string, at: string[][]][] = [
  [['money-qld'], '/graph/money.qld.json', generated],
  [['money-vic'], '/graph/money.vic.json', generated],
  [['money-tas'], '/graph/money.tas.json', generated],
  // AusTender's agency file; GrantConnect's awards are generated with it.
  [
    ['money-commonwealth', 'austender-agencies'],
    '/agencies.json',
    [['meta', 'generated_at']],
  ],
  [['money-qld-public', 'qld-grants'], '/graph/grants.qld.json', generated],
  [['interests'], '/interests/index.json', [['_meta', 'generated']]],
  [['ministerial-diaries', 'lobbyist-registers'], '/access.json', generated],
  [['community-funding'], '/research/mlci.json', [['as_of']]],
  [['programs-places'], '/evidence/index.json', [['meta', 'generated_at']]],
];

async function read(refresh: boolean): Promise<Loaded> {
  const settle = <T>(load: () => Promise<T>) =>
    load().then(
      (value) => ({ value, error: null as unknown }),
      (error: unknown) => ({ value: undefined, error }),
    );
  const [expenses, categories, pay, directory, discovery, summary, ...read] =
    await Promise.all([
      settle(() => catalogs.expenses()),
      settle(() => catalogs.expenseCategories()),
      settle(() => catalogs.pay()),
      settle(() => catalogs.directory(refresh)),
      settle(() => catalogs.discovery(refresh)),
      settle(() => reference.summary(refresh)),
      ...dateReads.map(([, path, at]) =>
        settle(() => apiClient.get(path, dateOf(...at), refresh)),
      ),
    ]);
  const partial = new Set<string>();
  if (expenses.error || categories.error) partial.add('ipea');
  if (pay.error) partial.add('pay');
  // A failed read leaves out the dataset it adds: say so, never "not listed".
  if (discovery.error) partial.add('lead-registers');
  if (directory.error) partial.add('release');
  const dates: Record<string, string | null> = {};
  const date = (ids: string[], value: string | null | undefined) => {
    if (value) for (const id of ids) dates[id] = value;
  };
  date(summarised, summary.value?.data.version);
  date(
    ['parliamentary-directory', 'release', 'aec-electorates'],
    directory.value?.manifest.asOf,
  );
  // The outlines are held in the app; their edition is their date. The
  // file is the state suggestion's own, parsed once, never at launch.
  date(['abs-state-districts'], stateOutlineFile().vintage);
  dateReads.forEach(([ids], index) => date(ids, read[index]?.value?.data));
  date(['ipea'], expenses.value?.asOf);
  date(['pay'], pay.value?.asOf);
  date(['lead-registers'], discovery.value?.asOf);
  const e = expenses.value?.data.meta;
  const c = categories.value?.data;
  return {
    expenses: e && { source: e.source, url: e.source_url, licence: e.licence },
    categories: c && {
      note: c.meta.licence_note,
      url: c.meta.source_url,
      licenceURL: c.meta.licence_url.replace(
        /^http:\/\/creativecommons\.org\//,
        'https://creativecommons.org/',
      ),
      definitionSources: [...new Set(c.categories.map((x) => x.source))],
      definitions: c.categories.flatMap((x) =>
        x.url ? [{ label: x.source, url: x.url }] : [],
      ),
    },
    pay: pay.value?.data.meta.sources.map((s) => ({
      label: `${s.publisher}: ${s.title}`,
      url: s.url,
    })),
    // The release's own source labels ("AEC 2019-05-18 tcp votes") in the
    // words a source line uses ("AEC two-candidate votes, 18 May 2019").
    release: directory.value?.manifest.data.sources.map((s) => ({
      label: sourceName(s.label).title,
      url: s.url,
      licence: s.licence === 'See source terms' ? undefined : s.licence,
    })),
    registers: discovery.value ? leadRegisters(discovery.value.data) : [],
    dates,
    partial,
    offline: [expenses, categories, pay, directory, discovery, summary].some(
      (r) => offlineError(r.error),
    ),
  };
}

// One read a session, shared by the hub, the list and each dataset page.
let session: Promise<Loaded> | null = null;
export function loadSources(refresh = false): Promise<Loaded> {
  if (!session || refresh) session = read(refresh);
  return session;
}
/** Forget the session's read (tests). */
export function resetSources() {
  session = null;
}

/**
 * The datasets, bundled ones at once and the loaded additions when their
 * reads settle. `settled` is false until then, so an unknown id waits for
 * the additions before it is called missing.
 */
export function useSources() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    let active = true;
    void loadSources(request > 0).then((value) => {
      if (!active) return;
      setLoaded(value);
      setRefreshing(false);
    });
    return () => {
      active = false;
    };
  }, [request]);
  const refresh = useCallback(() => {
    setRefreshing(true);
    setRequest((n) => n + 1);
  }, []);
  return {
    list: withLoaded(base, loaded),
    loaded,
    settled: loaded !== null,
    refreshing,
    refresh,
  };
}

/** The datasets with what the loaded reads say about themselves. */
export function withLoaded(list: Dataset[], loaded: Loaded | null): Dataset[] {
  if (!loaded) return list;
  const dated = (dataset: Dataset): Dataset => ({
    ...dataset,
    asOf: dataset.asOf ?? loaded.dates[dataset.id] ?? null,
  });
  return list
    .map((dataset) => {
      if (dataset.id === 'ipea') {
        const terms = [...dataset.terms];
        const links = [...dataset.links];
        if (loaded.expenses) {
          terms.push(`${loaded.expenses.source}, ${loaded.expenses.licence}.`);
          links.push({ label: 'Quarterly reports', url: loaded.expenses.url });
        }
        if (loaded.categories) {
          terms.push(
            loaded.categories.note,
            ...loaded.categories.definitionSources,
          );
          links.push(...loaded.categories.definitions);
          links.push(
            { label: 'Category notes', url: loaded.categories.url },
            { label: 'Category licence', url: loaded.categories.licenceURL },
          );
        }
        return { ...dataset, terms, links };
      }
      if (dataset.id === 'pay' && loaded.pay?.length)
        return { ...dataset, links: [...dataset.links, ...loaded.pay] };
      return dataset;
    })
    .concat(
      loaded.registers?.length
        ? [
            {
              id: 'lead-registers',
              name: 'Registers behind the leads',
              publisher: loaded.registers.map(([label]) => label).join('; '),
              terms: [
                'Each lead’s example records open the register that holds them. Source data keeps its own licence; check the original record before reuse.',
              ],
              links: loaded.registers.map(([label, url]) => ({ label, url })),
            },
          ]
        : [],
      loaded.release?.length
        ? [
            {
              id: 'release',
              name: 'Members and electorates',
              publisher: 'Electoral commissions and parliaments',
              terms: [
                ...new Set(
                  loaded.release.map((s) =>
                    s.licence ? `${s.label}: ${s.licence}.` : `${s.label}.`,
                  ),
                ),
                'Each source keeps its publisher’s own terms; check them before reuse.',
              ],
              links: loaded.release
                .filter((s) => s.url.startsWith('https://'))
                .map((s) => ({ label: s.label, url: s.url })),
            },
          ]
        : [],
    )
    .map(dated);
}

/** Alphabetical by name, as every list of datasets is drawn. */
export const byName = (list: readonly Dataset[]) =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, 'en-AU'));
