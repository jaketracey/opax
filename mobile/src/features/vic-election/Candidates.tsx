import { Fragment } from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { RecordResult } from '../../api/client';
import { PartyLabel } from '../../design/people';
import { isPartyLabel } from '../../design/party';
import { router } from 'expo-router';
import { partyRoute } from '../../navigation/routes/people';
import { Text } from '../../design/text';
import { minimumTarget, rhythm } from '../../design/tokens';
import { vicCopy as c } from './copy';
import type { Overview, SeatDetail } from './decoders';
import { phase, seatContext } from './model';
import { Block, ElectionSource, ExternalRow, shortDate } from './shared';
export function Candidates({
  record,
  o,
  now,
}: {
  record: RecordResult<SeatDetail>;
  o?: Overview;
  now: Date;
}) {
  const candidates = record.data.candidates;
  const { fontScale } = useWindowDimensions();
  if (
    !candidates &&
    (!o || phase(seatContext(record.data, o), now) === 'closed')
  )
    return null;
  const numbered = record.data.kind === 'district';
  const grouped =
    !numbered &&
    candidates?.list.some(
      (candidate) =>
        candidate.group !== undefined || candidate.group_name !== undefined,
    );
  return (
    <Block title={c.candidates} testID="vic-seat-candidates">
      {candidates ? (
        <>
          <Text wordSafe variant="footnote" tone="inkSoft">
            {c.ballot(shortDate(candidates.published))}
          </Text>
          {candidates.list.map((candidate, i) => {
            const party =
              candidate.party === 'Independent' ? null : candidate.party;
            const group = candidate.group || null;
            const heading = group
              ? c.candidateGroup(group, candidate.group_name ?? undefined)
              : c.ungroupedCandidates;
            const newGroup =
              grouped &&
              (i === 0 || (candidates.list[i - 1]!.group || null) !== group);
            return (
              <Fragment key={i}>
                {newGroup ? (
                  <Text
                    wordSafe
                    variant="subsectionTitle"
                    accessibilityRole="header"
                    testID={`vic-seat-candidate-group-${group ?? 'ungrouped'}`}
                  >
                    {heading}
                  </Text>
                ) : null}
                <View
                  accessible
                  accessibilityLabel={`${numbered ? `${i + 1}. ` : grouped ? `${heading}. ` : ''}${candidate.name}${party ? `, ${party}` : ''}.`}
                  accessibilityActions={
                    party && isPartyLabel(party)
                      ? [
                          {
                            name: 'openParty',
                            label: `Open ${party} party page`,
                          },
                        ]
                      : undefined
                  }
                  onAccessibilityAction={(event) => {
                    if (
                      event.nativeEvent.actionName === 'openParty' &&
                      party &&
                      isPartyLabel(party)
                    )
                      router.push(partyRoute(party));
                  }}
                  testID={`vic-seat-candidate-${i}`}
                  style={{
                    minHeight: minimumTarget,
                    flexDirection: 'row',
                    gap: rhythm.tight,
                    paddingVertical: rhythm.tight,
                  }}
                >
                  {numbered ? (
                    <Text
                      variant="secondary"
                      tone="inkSoft"
                      style={{
                        minWidth: Math.max(
                          32,
                          String(candidates.list.length).length *
                            12 *
                            fontScale,
                        ),
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {i + 1}
                    </Text>
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0, gap: rhythm.line }}>
                    <Text wordSafe variant="body">
                      {candidate.name}
                    </Text>
                    {party ? (
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      >
                        <PartyLabel party={party} />
                      </View>
                    ) : null}
                  </View>
                </View>
              </Fragment>
            );
          })}
          <ElectionSource
            record={record}
            dateLabel={c.published(shortDate(candidates.published))}
            citation={c.vecSource}
            originals={[{ label: c.candidateList, url: candidates.url }]}
          />
        </>
      ) : (
        <>
          <Text wordSafe variant="body" testID="vic-seat-candidates-none">
            {c.noCandidates}
          </Text>
          <ExternalRow title={c.vec} url={o!.sources.election} />
        </>
      )}
    </Block>
  );
}
