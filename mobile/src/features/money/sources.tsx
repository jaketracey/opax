import type { RecordResult } from '../../api/client';
import { copy } from '../../design/copy';
import type { FigureSource, SourceOriginal } from '../../design/primitives';
import { moneyDecodeLoss, type MoneyGraph } from './data';
import {
  moneyCaveats,
  moneySource,
  moneyYearNote,
  publicMoneySource,
} from './records';

/** "AEC" on every federal line; a state graph's commission by its short name. */
export function moneyShortSource(graph: MoneyGraph) {
  const federal =
    !graph.meta.jurisdiction || graph.meta.jurisdiction === 'federal';
  return federal
    ? 'AEC'
    : String(
        graph.meta.sourceShort ?? graph.meta.commission ?? graph.meta.source,
      );
}
/** Some records could not be read: said on the line and in the sheet. */
export function moneyPartial(graph: MoneyGraph) {
  return Object.values(moneyDecodeLoss(graph)).some((n) => n > 0);
}
/** Methodology stays available in full, in the map's source sheet. */
export function moneyNotes(graph: MoneyGraph): string[] {
  const meta = graph.meta;
  return [
    ...moneyCaveats(graph).filter((note) => !note.startsWith('Source:')),
    moneyYearNote,
    typeof meta.donor_nodes_by_total === 'number' &&
    typeof meta.donors_via_public_money === 'number' &&
    typeof meta.public_money_floor === 'number'
      ? `The map holds the ${meta.donor_nodes_by_total.toLocaleString('en-AU')} largest donors by lifetime donations, plus ${meta.donors_via_public_money.toLocaleString('en-AU')} smaller donors that hold at least $${(meta.public_money_floor / 1e6).toLocaleString('en-AU')} million in Commonwealth grants and contracts.`
      : null,
    'Grants and contracts go the other way: shown beside donations, never added to them. Contract values are as last published, not amounts paid.',
    'Adjust for inflation shows 2025–26 dollars, using the ABS Consumer Price Index (all groups, Australia, financial-year average). Nominal figures are on the returns.',
    'On the map, position is the industry cluster, colour the industry and size the connectedness. Parties sit at the centre, named beside their points.',
    ...(moneyPartial(graph) ? [copy.partialNote] : []),
  ].filter((note): note is string => !!note);
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
 * One block's source: dated, the register's short name, "Saved …" on a
 * saved copy and " · partial" after decode losses; the sheet holds the
 * originals, the notes and the licence.
 */
export function moneySourceDetails(
  record: RecordResult<MoneyGraph>,
  {
    citation,
    originals,
    notes,
    returns = true,
    testID,
  }: {
    /** The register the line names; the returns by default. */
    citation?: string | readonly string[];
    originals: readonly SourceOriginal[];
    notes: readonly (string | null | undefined | false)[];
    /** False for a public-money block: no returns note or returns licence. */
    returns?: boolean;
    testID: string;
  },
): FigureSource {
  const source = moneySource(record.data);
  const partial = moneyPartial(record.data);
  return {
    asOf: record.asOf ?? record.data.meta.generated,
    citation: citation ?? moneyShortSource(record.data),
    savedAt: record.stale ? record.savedAt : null,
    state: partial ? 'partial' : null,
    originals,
    notes: [
      returns ? `${source.citation}, ${record.data.meta.coverage}.` : null,
      ...notes,
      record.stale ? copy.savedCopyNote(record.savedAt) : null,
    ],
    licence: returns ? source.licence : null,
    testID,
  };
}
