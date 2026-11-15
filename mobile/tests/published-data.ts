import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import * as d from '../src/api/catalog-decoders';
import { ApiError } from '../src/api/errors';
import {
  isPartialCatalog,
  observeLeniency,
  type Leniency,
} from '../src/api/validation';
import { decodeOnThisDayIndex } from '../src/features/bills/on-this-day';
import { decodePartyFile } from '../src/features/directories/party-file';
import { decodeSittingDays } from '../src/features/today/sitting';
import { decodeRecentDivisions } from '../src/features/today/votes';

/**
 * The data guard's engine: the app's own decoders, as they ship, run over
 * the published JSON files the app reads (tests/published-data.test.ts).
 *
 * A file is a problem when its decoder refuses it, drops one of its rows or
 * reads a value leniently. The app tolerates the last two so that one bad
 * sub-record never hides a record; the guard does not, because versions
 * already on phones are stricter than this one, and a row the app drops is
 * a record the reader does not see. Each problem names the file and the
 * path inside it: `bills/au-federal-r7520.json divisions[2].question`.
 */
export type Decode = (value: unknown) => unknown;
export interface Family {
  name: string;
  /** Paths under the published folder, with forward slashes. */
  files: (root: string) => string[];
  decode: Decode;
}

/** `portal/public`, or the folder named by OPAX_PUBLISHED_DIR. */
export const publishedRoot = () =>
  resolve(
    process.env.OPAX_PUBLISHED_DIR ?? join(__dirname, '../../portal/public'),
  );

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
 * Every static file the app reads through `api/catalogs.ts`, with the
 * decoder that read uses. `/api/...` reads are answers, not files.
 */
export const families: Family[] = [
  {
    name: 'bills index',
    files: one('bills/index.json'),
    decode: d.decodeBillIndex,
  },
  {
    name: 'bills',
    files: (root) => listed(root, 'bills', (name) => name !== 'index.json'),
    decode: d.decodeBill,
  },
  {
    name: 'roster',
    files: one('parliamentarians.json'),
    decode: d.decodeRoster,
  },
  { name: 'votes', files: one('votes.json'), decode: d.decodeVotes },
  {
    name: 'electorates manifest',
    files: one('electorates/manifest.json'),
    decode: d.decodeManifest,
  },
  {
    name: 'electorate indexes',
    files: releases((name) => name === 'index.json'),
    decode: d.decodeElectorateIndex,
  },
  {
    name: 'electorate people',
    files: releases((name) => name === 'people.json'),
    decode: d.decodePeople,
  },
  {
    name: 'electorates',
    files: releases((name) => name.startsWith('el_')),
    decode: d.decodeElectorate,
  },
  {
    name: 'interests index',
    files: one('interests/index.json'),
    decode: d.decodeInterestIndex,
  },
  {
    name: 'recent interests',
    files: one('interests/recent.json'),
    decode: d.decodeRecentInterests,
  },
  {
    name: 'interests',
    // The keys the app's allow-list reads (api/policy.ts interestPath).
    files: (root) =>
      listed(root, 'interests', (name) =>
        /^(?:\d+|aph_\d+|n-[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.test(name),
      ),
    decode: d.decodeInterest,
  },
  {
    name: 'interest ties',
    files: one('interests/ties-by-donor.json'),
    decode: d.decodeInterestTies,
  },
  { name: 'pay', files: one('pay.json'), decode: d.decodePay },
  { name: 'expenses', files: one('expenses.json'), decode: d.decodeExpenses },
  {
    name: 'expense categories',
    files: one('expense-categories.json'),
    decode: d.decodeExpenseCategories,
  },
  {
    name: 'photo people',
    files: one('photos/people.json'),
    decode: d.decodePhotoPeople,
  },
  {
    name: 'photo credits',
    files: one('photos/credits.json'),
    decode: d.decodePhotoCredits,
  },
  { name: 'corpus', files: one('corpus.json'), decode: d.decodeCorpus },
  {
    name: 'discovery',
    files: one('discovery.json'),
    decode: d.decodeDiscovery,
  },
  {
    name: 'money graph',
    files: one('graph/money.json'),
    decode: d.decodeMoney,
  },
  {
    name: 'money extras',
    files: one('graph/aec-extras.json'),
    decode: d.decodeAecExtras,
  },
  {
    name: 'on this day',
    files: (root) =>
      listed(root, 'parliament/on-this-day', (name) =>
        /^\d{2}-\d{2}\.json$/.test(name),
      ),
    decode: decodeOnThisDayIndex,
  },
  {
    name: 'sitting days',
    files: one('parliament/sitting-days.json'),
    decode: decodeSittingDays,
  },
  {
    name: 'recent divisions',
    files: one('divisions/recent.json'),
    decode: decodeRecentDivisions,
  },
  {
    name: 'party files',
    files: (root) =>
      listed(root, 'graph', (name) =>
        /^money(\.(qld|vic|tas))?\.json$/.test(name),
      ),
    decode: decodePartyFile,
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
const join2 = (...parts: string[]) => parts.filter(Boolean).join('.');
/** "bill.divisions[2]" -> "divisions[2]": the row's place in its own file. */
const rowName = (label: string) => label.replace(/^[A-Za-z]+\./, '');

function leniencyLine(event: Leniency): string {
  if (event.kind === 'tolerated') {
    const field = event.at[event.at.length - 1]!;
    const rows = event.at.slice(0, -1).map(rowName);
    return `${join2(...rows, field)}: ${event.reason} (tolerated)`;
  }
  const [field, reason] = fieldPath(event.reason);
  return `${join2(...event.at.map(rowName), field)}: ${reason || 'Row dropped'} (row dropped)`;
}

/** The problems in one value, as "path: reason" lines; none when it is whole. */
export function problemsIn(value: unknown, decode: Decode): string[] {
  const found: string[] = [];
  const stop = observeLeniency((event) => found.push(leniencyLine(event)));
  try {
    const decoded = decode(value);
    // A decoder that lost something without saying where (an electorate's
    // outline, a lenient field) still marks what it returns as partial.
    if (!found.length && isPartialCatalog(decoded))
      found.push('(file): Read in part, with nothing named (partial)');
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const [field, reason] = fieldPath(error.message);
    found.push(`${field || '(file)'}: ${reason} (file refused)`);
  } finally {
    stop();
  }
  return found;
}

/** Every problem in one family, each line starting with its file. */
export function checkFamily(family: Family, root = publishedRoot()) {
  const files = family.files(root);
  const problems: string[] = [];
  for (const file of files) {
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(join(root, file), 'utf8'));
    } catch {
      problems.push(`${file} (file): Not JSON`);
      continue;
    }
    for (const line of problemsIn(value, family.decode))
      problems.push(`${file} ${line}`);
  }
  return { files: files.length, problems, root: relative(process.cwd(), root) };
}
