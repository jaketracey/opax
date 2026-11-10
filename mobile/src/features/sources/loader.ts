import { throwIfAborted } from '../../api/abort';
import { ReadSession } from '../../api/read-session';
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

async function read(refresh: boolean, signal?: AbortSignal): Promise<Loaded> {
  const settle = <T>(load: () => Promise<T>) =>
    load().then(
      (value) => ({ value, error: null as unknown }),
      (error: unknown) => ({ value: undefined, error }),
    );
  const [expenses, categories, pay, directory, discovery, summary] =
    await Promise.all([
      settle(() => catalogs.expenses(signal)),
      settle(() => catalogs.expenseCategories(signal)),
      settle(() => catalogs.pay(signal)),
      settle(() => catalogs.directory(refresh, signal)),
      settle(() => catalogs.discovery(refresh, signal)),
      settle(() => reference.summary(refresh, signal)),
    ]);
  throwIfAborted(signal);
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
let session = new ReadSession<Loaded>();
export function loadSources(
  refresh = false,
  signal?: AbortSignal,
): Promise<Loaded> {
  return session.read(
    'sources',
    (requestSignal) => read(refresh, requestSignal),
    { fresh: refresh, signal },
  );
}
/** Forget the session's reads (tests). */
export function resetSources() {
  session = new ReadSession<Loaded>();
  dateSession = new ReadSession<string | null>();
}

/**
 * A free catalogue file another screen already reads (the money map,
 * agencies, a person's interests and access, the grants research), read for
 * its date alone. The cache keeps the raw file, so this small decoder never
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
const fileDate =
  (path: string, ...at: string[][]) =>
  (refresh: boolean, signal?: AbortSignal) =>
    apiClient.get(path, dateOf(...at), refresh, { signal }).then((r) => r.data);
const generated = ['meta', 'generated'];

/**
 * The datasets dated by a read of their own, each by one file under about
 * 100 KB compressed. Only the Datasets list reads them all; a dataset's page
 * reads its own one; the hub reads none. Datasets whose only dated file is
 * larger (Queensland grants, the connections index) say "Date not
 * published" rather than download it for a date.
 */
const dateSources: Record<
  string,
  [
    key: string,
    (refresh: boolean, signal?: AbortSignal) => Promise<string | null>,
  ]
> = {};
const source = (
  ids: string[],
  key: string,
  load: (refresh: boolean, signal?: AbortSignal) => Promise<string | null>,
) => {
  for (const id of ids) dateSources[id] = [key, load];
};
source(
  ['money-qld'],
  'money.qld',
  fileDate('/graph/money.qld.json', generated),
);
source(
  ['money-vic'],
  'money.vic',
  fileDate('/graph/money.vic.json', generated),
);
source(
  ['money-tas'],
  'money.tas',
  fileDate('/graph/money.tas.json', generated),
);
// AusTender's agency file; GrantConnect's awards are generated with it.
source(
  ['money-commonwealth', 'austender-agencies'],
  'agencies',
  fileDate('/agencies.json', ['meta', 'generated_at']),
);
source(
  ['interests'],
  'interests',
  fileDate('/interests/index.json', ['_meta', 'generated']),
);
source(
  ['ministerial-diaries', 'lobbyist-registers'],
  'access',
  fileDate('/access.json', generated),
);
source(
  ['community-funding'],
  'mlci',
  fileDate('/research/mlci.json', ['as_of']),
);
// The outlines are held in the app; their edition is their date. The file
// is the state suggestion's own, parsed once, and only when asked for here.
source(['abs-state-districts'], 'outlines', () =>
  Promise.resolve(stateOutlineFile().vintage),
);

/** Whether a dataset's date comes from a read of its own. */
export const hasOwnDate = (id: string) => id in dateSources;
export const ownDateIds = () => Object.keys(dateSources);

// One read a session per file, shared by datasets that file dates.
let dateSession = new ReadSession<string | null>();
function loadDate(
  id: string,
  refresh: boolean,
  signal?: AbortSignal,
): Promise<string | null> {
  const [key, load] = dateSources[id]!;
  return dateSession.read(
    key,
    (requestSignal) =>
      load(refresh, requestSignal).catch(() => {
        throwIfAborted(requestSignal);
        return null;
      }),
    { fresh: refresh, signal },
  );
}

/**
 * The own dates of the given datasets, each as its read settles: absent
 * while pending, then the date or null. `request` above zero reads again.
 */
export function useOwnDates(ids: readonly string[], request = 0) {
  const key = ids.filter(hasOwnDate).join(' ');
  const [dates, setDates] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const wanted = key ? key.split(' ') : [];
    const refresh = request > 0;
    // A pull reads each file again once, however many datasets it dates.
    const reread = new Set<string>();
    for (const id of wanted) {
      const [file] = dateSources[id]!;
      const fresh = refresh && !reread.has(file);
      reread.add(file);
      void loadDate(id, fresh, controller.signal)
        .then((value) => {
          if (active) setDates((d) => ({ ...d, [id]: value }));
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, request]);
  return dates;
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
    const controller = new AbortController();
    void loadSources(request > 0, controller.signal)
      .then((value) => {
        if (!active) return;
        setLoaded(value);
        setRefreshing(false);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      controller.abort();
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
