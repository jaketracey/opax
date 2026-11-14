import { Text } from '../../design/text';
import type { District, Overview, SeatDetail } from './decoders';
import { electionState, seatContext, type ElectionContext } from './model';
import { vicCopy as c } from './copy';
import { SeatRow } from './rows';
import { Block, ExternalRow, shortDate } from './shared';

/** Current results use the district row, with historical holders kept separate. */
export function ElectionResults({
  o,
  seat,
  now,
}: {
  o?: Overview;
  seat?: SeatDetail;
  now: Date;
}) {
  const context: ElectionContext = seat ? seatContext(seat, o) : (o ?? {});
  const state = electionState(context, now);
  if (state !== 'results' && state !== 'results_final') return null;
  const results = o?.current_results;
  const rows =
    seat?.kind === 'district'
      ? context.current_result
        ? [{ name: seat.name, result: context.current_result }]
        : []
      : (results?.districts ?? []).filter(
          (row) => !seat || seat.districts.some((d) => d.name === row.name),
        );
  if (!rows.length) return null;
  return (
    <Block
      title={state === 'results_final' ? c.finalResults : c.currentResults}
      testID="vic-election-current-results"
    >
      {results && o ? (
        <Text wordSafe variant="footnote" tone="inkSoft">
          {c.resultsNote(results.districts.length, o.districts.length)}{' '}
          {c.updated(shortDate(results.fetched))}.
        </Text>
      ) : null}
      {rows.map(({ name, result }) => {
        const district: District | undefined =
          o?.districts.find((d) => d.name === name) ??
          (seat?.kind === 'district'
            ? {
                kind: 'district',
                slug: seat.slug,
                name: seat.name,
                region: seat.region?.name ?? '',
                electorate_url: seat.electorate_url,
                member: seat.members[0]!,
                result: null,
                candidates: seat.candidates?.list.length ?? 0,
              }
            : undefined);
        return district ? (
          <SeatRow
            key={district.slug}
            district={district}
            currentResult={result}
            external={seat?.kind === 'district'}
            testID={`vic-election-current-${district.slug}`}
          />
        ) : null;
      })}
      <ExternalRow
        title={c.allResults}
        url={
          results?.url ??
          'https://www.vec.vic.gov.au/results/state-election-results'
        }
      />
    </Block>
  );
}
