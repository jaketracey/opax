import type { RecordResult } from '../../api/client';
import {
  OfflineBanner,
  SourceLine,
  type SourceOriginal,
} from '../../design/primitives';
import { moneyDecodeLoss, type MoneyGraph } from './data';
import { moneyCaveats, moneySource, publicMoneySource } from './records';
import { disclosureYearNote } from '../../design/format';

/**
 * A saved copy says so in the block's source line ("Saved 3 Oct 2026"); the
 * banner says only that the app is offline.
 */
export function MoneyRecordStatus({
  record,
}: {
  record: RecordResult<MoneyGraph>;
}) {
  return record.stale ? <OfflineBanner testID="money-stale" /> : null;
}
/** Methodology stays available in full, in the map's source sheet. */
export function moneyNotes(graph: MoneyGraph): string[] {
  return [
    ...moneyCaveats(graph).filter((note) => !note.startsWith('Source:')),
    disclosureYearNote,
    'Public grants and contracts go the other way: shown beside the donations in each donor’s record, never summed with them. Contracts are recorded commitments, not verified payments.',
    'The list ranks donors by disclosed donations, largest first. Donors on the map for the public money they hold, not for the size of their donations, are public-money records and have no donation rank.',
    'Adjust for inflation shows 2025–26 dollars, using the ABS Consumer Price Index (all groups, Australia, financial-year average). Nominal figures are on the returns.',
    'Position is the category cluster, colour the category, size the connectedness, and depth fades through fog. Parties sit at the centre, named beside their nodes.',
    'Drag with one finger to orbit, pinch to zoom, tap a node for its record. The list gives the same recorded figures.',
    ...(Object.values(moneyDecodeLoss(graph)).some((n) => n > 0)
      ? [
          'Some records could not be read and are omitted. Displayed relationships may be incomplete.',
        ]
      : []),
  ];
}
/** The registers behind the map: the returns, then any public-money layer. */
export function moneyOriginals(graph: MoneyGraph): SourceOriginal[] {
  const returns = moneySource(graph);
  return [
    { label: returns.label, url: returns.url },
    ...(['grants', 'contracts'] as const)
      .filter((kind) => graph.meta[`${kind}_source`])
      .map((kind) => {
        const source = publicMoneySource(graph, kind);
        return { label: source.label, url: source.url };
      }),
  ];
}
/**
 * One source line for a block of the money record: dated, the register's
 * name, "Saved …" on a saved copy; the sheet holds the originals, the
 * notes and the licence.
 */
export function MoneySourceLine({
  record,
  title,
  citation,
  originals,
  notes,
  returns = true,
  testID,
}: {
  record: RecordResult<MoneyGraph>;
  title: string;
  /** The register the line names; the disclosure returns by default. */
  citation?: string;
  originals: readonly SourceOriginal[];
  notes: readonly (string | null | undefined | false)[];
  /** False for a public-money block: no returns note or returns licence. */
  returns?: boolean;
  testID: string;
}) {
  const source = moneySource(record.data);
  // The line names the register; the sheet adds what the map aggregates and
  // the years it covers.
  return (
    <SourceLine
      title={title}
      asOf={record.asOf}
      savedAt={record.stale ? record.savedAt : null}
      citation={citation ?? source.label}
      originals={originals}
      notes={[
        returns ? `${source.citation}, ${record.data.meta.coverage}.` : null,
        ...notes,
      ]}
      licence={returns ? source.licence : null}
      testID={testID}
    />
  );
}
