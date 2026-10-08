import { catalogs } from '../../api/runtime';
import { buildPortraitIndexAsync } from '../../api/portrait-index';
import {
  peopleRows,
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
export async function loadDirectory(
  kind: DirectoryKind,
  refresh = false,
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
      catalogs.directory(refresh),
      catalogs.votes(),
      catalogs.photoPeople(refresh),
      catalogs.photoCredits(refresh),
    ]);
    const portraits = await buildPortraitIndexAsync({
      roster: d.roster.data,
      slugs: d.slugs.data,
      people: d.people.data,
      manifest: d.manifest.data,
      photoPeople: photos.data,
      photoCredits: credits.data,
    });
    rows.people = peopleRows(d, votes.data, portraits);
    rows.facets = peopleFacets(rows.people);
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
    const [roster, federal, qld, vic] = await Promise.all([
      catalogs.roster(refresh),
      catalogs.partyFile('federal', refresh),
      catalogs.partyFile('qld', refresh),
      catalogs.partyFile('vic', refresh),
    ]);
    rows.parties = partyRows(roster.data, {
      federal: federal.data,
      qld: qld.data,
      vic: vic.data,
    });
    rows.facets = partyFacets;
    records.push(roster, federal, qld, vic);
    sources.push(
      {
        asAt: roster.data.meta.generated,
        label:
          'OPAX parliamentary roster (speech totals and directory members)',
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
    const manifest = await catalogs.manifest(refresh),
      index = await catalogs.electorates(manifest.data, refresh);
    if (index.data.meta.release_id !== manifest.data.release_id)
      throw new Error('The electorate release does not match its manifest.');
    rows.electorates = index.data.electorates;
    rows.facets = electorateFacets(rows.electorates);
    records.push(manifest, index);
    sources.push({
      asAt: index.data.meta.generated,
      label: 'OPAX electorate reference release',
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
