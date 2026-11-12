import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { InlineError, Skeleton } from '../../design/states';
import { Text } from '../../design/text';
import { SourceLine } from '../../design/source';
import { rhythm } from '../../design/tokens';
import { isAbortError } from '../../api/abort';
import { vicCopy as c } from './copy';
import type { FindResponse, Overview } from './decoders';
import { electionReads } from './reads';
import { localMatches } from './model';
import { RegionRow, SeatRow } from './rows';
import { Block, ElectionFoot, ExternalRow } from './shared';

export function Finder({
  q,
  submit,
  o,
}: {
  q: string;
  submit: number;
  o: Overview;
}) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    q: string;
    response: FindResponse | null;
    error: boolean;
  } | null>(null);
  const query = q.trim().slice(0, 60);
  useEffect(() => {
    if (!query || (query.length < 3 && submit === 0)) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        void electionReads
          .find(query, controller.signal)
          .then((record) => {
            if (controller.signal.aborted) return;
            if (record.stale) {
              setState({ q: query, response: null, error: true });
              return;
            }
            setState({ q: query, response: record.data, error: false });
            AccessibilityInfo.announceForAccessibility(
              c.found(record.data.hits.length),
            );
          })
          .catch((error) => {
            if (!controller.signal.aborted && !isAbortError(error))
              setState({ q: query, response: null, error: true });
          });
      },
      submit || retry ? 0 : 400,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, submit, retry]);
  const current = state?.q === query ? state : null;
  const r = current?.response;
  return (
    <View testID="vic-election-results" style={{ gap: rhythm.block }}>
      {current?.error ? (
        <>
          <InlineError
            subject={c.placeholder}
            message={c.findFailed}
            onRetry={() => setRetry((n) => n + 1)}
          />
          {localMatches(o, query).map((d) => (
            <SeatRow key={d.slug} district={d} />
          ))}
        </>
      ) : !r ? (
        <Skeleton shape="rows" count={3} label={c.searching} />
      ) : (
        <>
          {r.hits.map((hit, index) => (
            <Block
              key={`${hit.kind}:${hit.name}:${index}`}
              testID={`vic-election-hit-${index}`}
              title={
                hit.kind === 'District' || hit.kind === 'Region'
                  ? undefined
                  : `${hit.name} · ${hit.kind}`
              }
            >
              {hit.seats.map((s) =>
                s.kind === 'district' ? (
                  <SeatRow
                    key={s.slug}
                    testID={`vic-election-hit-${index}-district-${s.slug}`}
                    district={s}
                    share={s.share}
                    place={hit.name}
                  />
                ) : (
                  <RegionRow
                    key={s.slug}
                    region={s}
                    testID={`vic-election-hit-${index}-region-${s.slug}`}
                  />
                ),
              )}
            </Block>
          ))}
          {!r.hits.length ? (
            <>
              <Text testID="vic-election-results-empty" wordSafe variant="body">
                {r.empty === 'postcode' ? c.noPostcode(r.q) : c.noPlace(r.q)}
              </Text>
              <ExternalRow
                testID="vic-election-address"
                title={c.address}
                url={r.address_url}
              />
            </>
          ) : null}
          {r.split ? (
            <>
              <Text wordSafe variant="footnote" tone="inkSoft">
                {c.split}
              </Text>
              <ExternalRow
                testID="vic-election-address"
                title={c.exactAddress}
                url={r.address_url}
              />
            </>
          ) : null}
          {!r.places_searched ? (
            <Text wordSafe variant="footnote" tone="inkSoft">
              {c.placesMissing}
            </Text>
          ) : null}
          <SourceLine
            testID="vic-election-sources"
            citation={c.abs}
            dateLabel={null}
            coverage={c.census}
            notes={[r.attribution, r.note]}
          />
        </>
      )}
      <ElectionFoot o={o} testID="vic-election-foot" />
    </View>
  );
}
