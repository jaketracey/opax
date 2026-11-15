import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

/**
 * The data guard's engine: an app build's own decoders run over the
 * published JSON files the app reads (tests/published-data.test.ts).
 *
 * Published data must decode under the strictest decoders still on
 * readers' phones, not only the newest. So the decoders are not imported
 * here: they are loaded from a source tree, this one by default or the
 * `mobile/src` of a pinned build (OPAX_DECODERS_SRC, named by
 * OPAX_DECODERS_LABEL), and the helper adapts to what that build has.
 *
 * A file is a problem when its decoder refuses it, drops one of its rows,
 * reads a value leniently or returns a partial result. Each problem names
 * the build, the file and the path inside it:
 * `[1.1.3 (57)] bills/au-federal-r7520.json divisions.question`.
 */
export type Decode = (value: unknown) => unknown;
export interface Family {
  name: string;
  /**
   * One path of the family as the app asks for it, to put to the build's
   * own allow-list (api/policy.ts): a build that may read the path must
   * have its decoder here.
   */
  path: string;
  /** Paths under the published folder, with forward slashes. */
  files: (root: string) => string[];
  /** Absent when this build has no decoder for the family. */
  decode: Decode | undefined;
}

/** `portal/public`, or the folder named by OPAX_PUBLISHED_DIR. */
export const publishedRoot = () =>
  resolve(
    process.env.OPAX_PUBLISHED_DIR ?? join(__dirname, '../../portal/public'),
  );
/** The source tree whose decoders are checked: a build's `mobile/src`. */
export const decodersRoot = () =>
  resolve(process.env.OPAX_DECODERS_SRC ?? join(__dirname, '../src'));
/** The build's name in every message ("1.1.3 (57)"), when one is given. */
export const buildLabel = () => process.env.OPAX_DECODERS_LABEL ?? '';
const prefix = () => (buildLabel() ? `[${buildLabel()}] ` : '');

type Module = Record<string, unknown>;
/** A module of the build's source, or nothing when that build has none. */
function load(path: string): Module {
  const file = join(decodersRoot(), path);
  if (!['.ts', '.tsx'].some((ext) => existsSync(file + ext))) return {};
  // The build's source is chosen at run time, so it cannot be imported.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(file) as Module;
}
const decoder = (module: Module, name: string) =>
  typeof module[name] === 'function' ? (module[name] as Decode) : undefined;

const d = load('api/catalog-decoders');
const validation = load('api/validation');
const errors = load('api/errors');

const listed = (
  root: string,
  folder: string,
  keep: (name: string) => boolean,
) =>
  existsSync(join(root, folder))
    ? readdirSync(join(root, folder))
        .filter((name) => name.endsWith('.json') && keep(name))
        .sort()
        .map((name) => `${folder}/${name}`)
    : [];
const one = (path: string) => (root: string) =>
  existsSync(join(root, path)) ? [path] : [];
const releases = (keep: (name: string) => boolean) => (root: string) => {
  const folder = 'electorates/releases';
  if (!existsSync(join(root, folder))) return [];
  return readdirSync(join(root, folder))
    .filter((id) => statSync(join(root, folder, id)).isDirectory())
    .sort()
    .flatMap((id) => listed(root, `${folder}/${id}`, keep));
};

/**
 * `/people/firsts.json` under the build's own decoder, with nothing left
 * out. The app leaves out a fact it cannot read (a first speech with no
 * date, a first division with no source) without a word, so that the
 * person's other fact still stands; here every fact the file gives must be
 * one the decoder kept. A key it refuses is a dropped row, reported by the
 * decoder itself.
 *
 * Built from the build's own source like every other decoder: a build with
 * no `api/people-firsts` (1.1.4 (73) and 1.1.3 (57) never read the file)
 * has no decoder for the family, and is never checked with a newer one.
 */
const decodeFirsts = decoder(load('api/people-firsts'), 'decodePeopleFirsts');
const tolerated = validation.tolerated as
  | ((at: string, reason: string) => void)
  | undefined;
export const decodeFirstsWhole: Decode | undefined =
  decodeFirsts && typeof tolerated === 'function'
    ? (value) => {
        const decoded = decodeFirsts(value) as Record<
          'by_pid' | 'by_name',
          Record<string, Record<string, unknown>>
        >;
        const given = value as Record<
          string,
          Record<string, Record<string, unknown>>
        >;
        for (const group of ['by_pid', 'by_name'] as const)
          for (const [key, kept] of Object.entries(decoded[group]))
            for (const fact of ['first_speech', 'first_division'] as const)
              if (given[group]![key]![fact] != null && !kept[fact])
                tolerated(
                  `${group}.${key}.${fact}`,
                  'Could not be read, left out of the person’s firsts',
                );
        return decoded;
      }
    : undefined;

/**
 * Every static file the app reads through `api/catalogs.ts`, with the
 * decoder that read uses in this build. `/api/...` reads are answers, not
 * files. A build without a family's decoder never reads that family.
 */
export const families: Family[] = [
  {
    name: 'bills index',
    path: '/bills/index.json',
    files: one('bills/index.json'),
    decode: decoder(d, 'decodeBillIndex'),
  },
  {
    name: 'bills',
    path: '/bills/au-federal-r1.json',
    files: (root) => listed(root, 'bills', (name) => name !== 'index.json'),
    decode: decoder(d, 'decodeBill'),
  },
  {
    name: 'roster',
    path: '/parliamentarians.json',
    files: one('parliamentarians.json'),
    decode: decoder(d, 'decodeRoster'),
  },
  {
    name: 'votes',
    path: '/votes.json',
    files: one('votes.json'),
    decode: decoder(d, 'decodeVotes'),
  },
  {
    name: 'electorates manifest',
    path: '/electorates/manifest.json',
    files: one('electorates/manifest.json'),
    decode: decoder(d, 'decodeManifest'),
  },
  {
    name: 'electorate indexes',
    path: '/electorates/releases/0123456789abcdef/index.json',
    files: releases((name) => name === 'index.json'),
    decode: decoder(d, 'decodeElectorateIndex'),
  },
  {
    name: 'electorate people',
    path: '/electorates/releases/0123456789abcdef/people.json',
    files: releases((name) => name === 'people.json'),
    decode: decoder(d, 'decodePeople'),
  },
  {
    name: 'electorates',
    path: '/electorates/releases/0123456789abcdef/el_0123456789abcdef01234567.json',
    files: releases((name) => name.startsWith('el_')),
    decode: decoder(d, 'decodeElectorate'),
  },
  {
    name: 'interests index',
    path: '/interests/index.json',
    files: one('interests/index.json'),
    decode: decoder(d, 'decodeInterestIndex'),
  },
  {
    name: 'recent interests',
    path: '/interests/recent.json',
    files: one('interests/recent.json'),
    decode: decoder(d, 'decodeRecentInterests'),
  },
  {
    name: 'interests',
    path: '/interests/1.json',
    // The keys the app's allow-list reads (api/policy.ts interestPath).
    files: (root) =>
      listed(root, 'interests', (name) =>
        /^(?:\d+|aph_\d+|n-[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.test(name),
      ),
    decode: decoder(d, 'decodeInterest'),
  },
  {
    name: 'interest ties',
    path: '/interests/ties-by-donor.json',
    files: one('interests/ties-by-donor.json'),
    decode: decoder(d, 'decodeInterestTies'),
  },
  {
    name: 'pay',
    path: '/pay.json',
    files: one('pay.json'),
    decode: decoder(d, 'decodePay'),
  },
  {
    name: 'expenses',
    path: '/expenses.json',
    files: one('expenses.json'),
    decode: decoder(d, 'decodeExpenses'),
  },
  {
    name: 'expense categories',
    path: '/expense-categories.json',
    files: one('expense-categories.json'),
    decode: decoder(d, 'decodeExpenseCategories'),
  },
  {
    name: 'photo people',
    path: '/photos/people.json',
    files: one('photos/people.json'),
    decode: decoder(d, 'decodePhotoPeople'),
  },
  {
    name: 'photo credits',
    path: '/photos/credits.json',
    files: one('photos/credits.json'),
    decode: decoder(d, 'decodePhotoCredits'),
  },
  {
    name: 'corpus',
    path: '/corpus.json',
    files: one('corpus.json'),
    decode: decoder(d, 'decodeCorpus'),
  },
  {
    name: 'discovery',
    path: '/discovery.json',
    files: one('discovery.json'),
    decode: decoder(d, 'decodeDiscovery'),
  },
  {
    name: 'money graph',
    path: '/graph/money.json',
    files: one('graph/money.json'),
    decode: decoder(d, 'decodeMoney'),
  },
  {
    name: 'money extras',
    path: '/graph/aec-extras.json',
    files: one('graph/aec-extras.json'),
    decode: decoder(d, 'decodeAecExtras'),
  },
  {
    name: 'on this day',
    path: '/parliament/on-this-day/01-01.json',
    files: (root) =>
      listed(root, 'parliament/on-this-day', (name) =>
        /^\d{2}-\d{2}\.json$/.test(name),
      ),
    decode: decoder(load('features/bills/on-this-day'), 'decodeOnThisDayIndex'),
  },
  {
    name: 'sitting days',
    path: '/parliament/sitting-days.json',
    files: one('parliament/sitting-days.json'),
    decode: decoder(load('features/today/sitting'), 'decodeSittingDays'),
  },
  {
    name: 'recent divisions',
    path: '/divisions/recent.json',
    files: one('divisions/recent.json'),
    decode: decoder(load('features/today/votes'), 'decodeRecentDivisions'),
  },
  {
    // A side file to the roster, read from build 78 on.
    name: 'people firsts',
    path: '/people/firsts.json',
    files: one('people/firsts.json'),
    decode: decodeFirstsWhole,
  },
  {
    name: 'party files',
    path: '/graph/money.qld.json',
    files: (root) =>
      listed(root, 'graph', (name) =>
        /^money(\.(qld|vic|tas))?\.json$/.test(name),
      ),
    decode: decoder(load('features/directories/party-file'), 'decodePartyFile'),
  },
];

/** "divisions: question: The catalog…" -> ["divisions.question", "The catalog…"]. */
function fieldPath(message: string): [string, string] {
  const parts = message.split(': ');
  const fields: string[] = [];
  while (parts.length > 1 && /^[\w.[\]-]+$/.test(parts[0]!))
    fields.push(parts.shift()!);
  return [fields.join('.'), parts.join(': ')];
}
const joined = (...parts: string[]) => parts.filter(Boolean).join('.');
/** "bill.divisions[2]" -> "divisions[2]": the row's place in its own file. */
const rowName = (label: string) => label.replace(/^[A-Za-z]+\./, '');

interface Leniency {
  kind: 'dropped' | 'tolerated';
  at: string[];
  reason: string;
}
function leniencyLine(event: Leniency): string {
  if (event.kind === 'tolerated') {
    const field = event.at[event.at.length - 1]!;
    const rows = event.at.slice(0, -1).map(rowName);
    return `${joined(...rows, field)}: ${event.reason} (tolerated)`;
  }
  const [field, reason] = fieldPath(event.reason);
  return `${joined(...event.at.map(rowName), field)}: ${reason || 'Row dropped'} (row dropped)`;
}

/**
 * Hears what the build's decoders let through while `run` decodes. A build
 * with the leniency observer (build 80 on) names the row and field. An
 * older, stricter build only warns "Dropped malformed catalog row: label
 * [n]" in development, which is heard here instead and names the row.
 */
function listening(run: () => void): string[] {
  const found: string[] = [];
  const observe = validation.observeLeniency as
    | ((listener: (event: Leniency) => void) => () => void)
    | undefined;
  const stop = observe?.((event) => found.push(leniencyLine(event)));
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    const dropped = /^Dropped malformed catalog row: (.+) \[(.+)\]$/.exec(
      String(args[0]),
    );
    if (dropped && !observe)
      found.push(
        `${rowName(dropped[1]!)}[${dropped[2]}]: Row dropped (row dropped)`,
      );
  };
  try {
    run();
  } finally {
    console.warn = warn;
    stop?.();
  }
  return found;
}

/**
 * Whether this build may ask for `path`: its own allow-list's answer
 * (api/policy.ts `assertAllowedPath`), or null when the build has no such
 * list to ask.
 */
export function buildReads(path: string): boolean | null {
  const allow = load('api/policy').assertAllowedPath as
    | ((path: string) => void)
    | undefined;
  if (typeof allow !== 'function') return null;
  try {
    allow(path);
    return true;
  } catch {
    return false;
  }
}

const isInvalidData = (error: unknown) =>
  typeof errors.ApiError === 'function'
    ? error instanceof (errors.ApiError as new () => Error)
    : error instanceof Error && error.name === 'ApiError';
const isPartial = (value: unknown) =>
  typeof validation.isPartialCatalog === 'function' &&
  (validation.isPartialCatalog as (v: unknown) => boolean)(value);

/** The problems in one value, as "path: reason" lines; none when it is whole. */
export function problemsIn(value: unknown, decode: Decode): string[] {
  let refused: string | null = null;
  let partial = false;
  const found = listening(() => {
    try {
      partial = isPartial(decode(value));
    } catch (error) {
      if (!isInvalidData(error)) throw error;
      const [field, reason] = fieldPath((error as Error).message);
      refused = `${field || '(file)'}: ${reason} (file refused)`;
    }
  });
  if (refused) found.push(refused);
  // A decoder that lost something without saying where (an electorate's
  // outline, a lenient field) still marks what it returns as partial.
  else if (!found.length && partial)
    found.push('(file): Read in part, with nothing named (partial)');
  return found;
}

/** Every problem in one family, each line naming the build and the file. */
export function checkFamily(family: Family, root = publishedRoot()) {
  const files = family.decode ? family.files(root) : [];
  const problems: string[] = [];
  for (const file of files) {
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(join(root, file), 'utf8'));
    } catch {
      problems.push(`${prefix()}${file} (file): Not JSON`);
      continue;
    }
    for (const line of problemsIn(value, family.decode!))
      problems.push(`${prefix()}${file} ${line}`);
  }
  return { files: files.length, problems, root: relative(process.cwd(), root) };
}
