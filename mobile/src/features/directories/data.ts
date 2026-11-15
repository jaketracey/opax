import { throwIfAborted } from '../../api/abort';
import { catalogs } from '../../api/runtime';
import { buildPortraitIndexAsync } from '../../api/portrait-index';
import {
  peopleRowsAsync,
  partyRows,
  peopleFacets,
  partyFacets,
  electorateFacets,
  type DirectoryKind,
  type PeopleRow,
  type PartyRow,
  type Facet,
} from './model';
import type { Electorate } from '../../api/catalog-decoders';
import type { RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';

const outOfStep = (records: string) =>
  new ApiError(
    'invalid-data',
    `The ${records} records are out of step. Try again shortly.`,
  );
/** The roster and the dated seats must come from one release. */
async function directory(refresh: boolean, signal?: AbortSignal) {
  try {
    return await catalogs.directory(refresh, signal);
  } catch (error) {
    throwIfAborted(signal);
    if (
      error instanceof ApiError &&
      error.code === 'invalid-data' &&
      /release is incomplete/.test(error.message)
    )
      throw outOfStep('people');
    throw error;
  }
}

export interface DirectoryRecord {
  people: PeopleRow[];
  parties: PartyRow[];
  electorates: Electorate[];
  facets: Facet[];
  stale: boolean;
  savedAt: number;
  partial: boolean;
  staleReason?: RecordResult<unknown>['staleReason'];
  sources: { asAt: string | null; label: string }[];
}
/** The people rows last built, and the catalogue snapshots they came from. */
type BuiltRows = {
  inputs: readonly unknown[];
  people: PeopleRow[];
  facets: Facet[];
};
let built: BuiltRows | null = null;
/**
 * The build in progress. It is not tied to any one screen's signal: if the
 * screen is left, the build still finishes and keeps its rows, and a reopen
 * with the same snapshots joins it instead of starting a second build
 * beside it.
 */
let building: {
  inputs: readonly unknown[];
  done: Promise<BuiltRows>;
} | null = null;
/** Tests start each case with nothing built. */
export function forgetDirectoryRows() {
  built = null;
  building = null;
}
export async function loadDirectory(
  kind: DirectoryKind,
  refresh = false,
  signal?: AbortSignal,
): Promise<DirectoryRecord> {
  const rows = {
    people: [] as PeopleRow[],
    parties: [] as PartyRow[],
    electorates: [] as Electorate[],
    facets: [] as Facet[],
  };
  const records: RecordResult<unknown>[] = [];
  const sources: DirectoryRecord['sources'] = [];
  if (kind === 'person') {
    const [d, votes, photos, credits] = await Promise.all([
      directory(refresh, signal),
      catalogs.votes(signal),
      catalogs.photoPeople(refresh, signal),
      catalogs.photoCredits(refresh, signal),
    ]);
    // The catalogues are immutable snapshots, the same objects while their
    // bytes are unchanged (a revalidation that finds nothing new, coming
    // back to Members). The same inputs give the same rows: they are built
    // once, not again on every load.
    const inputs = [
      d.roster.data,
      d.slugs.data,
      d.people.data,
      d.manifest.data,
      d.electorates.data,
      votes.data,
      photos.data,
      credits.data,
    ];
    if (!built || inputs.some((input, i) => input !== built!.inputs[i])) {
      if (
        !building ||
        inputs.some((input, i) => input !== building!.inputs[i])
      ) {
        const done = (async () => {
          const portraits = await buildPortraitIndexAsync({
            roster: d.roster.data,
            slugs: d.slugs.data,
            people: d.people.data,
            manifest: d.manifest.data,
            photoPeople: photos.data,
            photoCredits: credits.data,
          });
          const people = await peopleRowsAsync(d, votes.data, portraits);
          return (built = { inputs, people, facets: peopleFacets(people) });
        })();
        const run = (building = { inputs, done });
        const clear = () => {
          if (building === run) building = null;
        };
        done.then(clear, clear);
      }
      const ready: BuiltRows = await building!.done;
      throwIfAborted(signal);
      rows.people = ready.people;
      rows.facets = ready.facets;
    } else {
      rows.people = built.people;
      rows.facets = built.facets;
    }
    records.push(...Object.values(d), votes, photos, credits);
    sources.push(
      {
        asAt: d.roster.data.meta.generated,
        label: 'OPAX parliamentary roster',
      },
      {
        asAt: d.people.data.meta.generated,
        label: 'Dated parliamentary seats',
      },
      {
        asAt: votes.data.meta?.content_changed_at ?? null,
        label: 'They Vote For You and NSW, Victorian and Queensland Hansard',
      },
    );
  } else if (kind === 'party') {
    const [d, federal, qld, vic] = await Promise.all([
      directory(refresh, signal),
      catalogs.partyFile('federal', refresh, signal),
      catalogs.partyFile('qld', refresh, signal),
      catalogs.partyFile('vic', refresh, signal),
    ]);
    rows.parties = partyRows(d, {
      federal: federal.data,
      qld: qld.data,
      vic: vic.data,
    });
    rows.facets = partyFacets;
    records.push(...Object.values(d), federal, qld, vic);
    sources.push(
      {
        asAt: d.roster.data.meta.generated,
        label: 'OPAX parliamentary roster',
      },
      {
        asAt: d.people.data.meta.generated,
        label: 'Dated parliamentary seats',
      },
      ...[
        [federal, 'AEC returns'],
        [qld, 'ECQ gifts register'],
        [vic, 'VEC disclosures'],
      ].map(([r, label]) => ({
        asAt: (r as typeof federal).data.meta.generated,
        label: label as string,
      })),
    );
  } else {
    const manifest = await catalogs.manifest(refresh, signal),
      index = await catalogs.electorates(manifest.data, refresh, signal);
    if (index.data.meta.release_id !== manifest.data.release_id)
      throw outOfStep('electorate');
    rows.electorates = index.data.electorates;
    rows.facets = electorateFacets(rows.electorates);
    records.push(manifest, index);
    sources.push({
      asAt: index.data.meta.generated,
      label: 'OPAX electorate list',
    });
  }
  return {
    ...rows,
    sources,
    stale: records.some((r) => r.stale),
    savedAt: Math.min(...records.map((r) => r.savedAt)),
    partial: records.some((r) => r.partial),
    staleReason: records.find((r) => r.staleReason)?.staleReason,
  };
}
