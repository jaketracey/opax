import { StyleSheet, View } from 'react-native';
import type { RecordResult } from '../../api/client';
import { useAccessibilitySize } from '../../design/accessibility';
import { PersonRow } from '../../design/people';
import { useRowCellStyle, useRowInset } from '../../design/row-padding';
import { LinkRow, ValueRow } from '../../design/rows';
import { StatusCapsule } from '../../design/labels';
import { spokenFigures } from '../../design/format';
import { Text } from '../../design/text';
import { minimumTarget, rhythm } from '../../design/tokens';
import { fromWebPath, openSource } from '../../navigation/external';
import {
  personRoute,
  personSpeechesRoute,
} from '../../navigation/routes/people';
import { CachedPortrait } from '../CachedPortrait';
import { vicCopy as c } from './copy';
import type { Member, SeatDetail } from './decoders';
import { Block, ElectionSource, shortDate } from './shared';

export function MemberRow({
  member: m,
  detail,
}: {
  member: Member;
  detail?: string;
}) {
  return (
    <PersonRow
      testID={`vic-seat-member-${m.slug}`}
      name={m.name}
      party={m.party}
      portrait={<CachedPortrait name={m.name} slug={m.slug} />}
      href={personRoute(m.slug)}
      detail={detail}
    />
  );
}
export function MemberSource({ record }: { record: RecordResult<SeatDetail> }) {
  const s = record.data;
  return (
    <ElectionSource
      record={record}
      asOf={s.speech_updated}
      citation={c.parliament}
      originals={s.members.map((m) => ({ label: m.name, url: m.source_url }))}
      notes={
        s.division_start
          ? [
              c.divisions(
                shortDate(s.division_start).replace(/ \d{4}$/, ''),
                shortDate(s.division_end),
              ),
            ]
          : []
      }
    />
  );
}
export function MemberRecord({
  member: m,
  record,
}: {
  member: Member;
  record: RecordResult<SeatDetail>;
}) {
  const any = m.votes || m.speeches;
  return (
    <Block title={c.done(m.name)} testID="vic-seat-record">
      {m.speech_gap ? (
        <Text wordSafe variant="footnote" tone="inkSoft">
          {m.speech_gap}
        </Text>
      ) : null}
      {!any ? (
        <MemberRow member={m} />
      ) : (
        <>
          {!m.speech_gap && m.speeches ? (
            <ValueRow
              label={c.speechYears(m.speeches.first, m.speeches.last)}
              value={m.speeches.count.toLocaleString('en-AU')}
            />
          ) : null}
          {m.votes ? (
            // One row: the count, with its split as the label's detail
            // (it was a loose line between this row and Recent votes).
            <VoteCountRow
              label={c.votes(record.data.division_end.slice(0, 4))}
              detail={c.voteCounts(m.votes.ayes, m.votes.noes)}
              value={String(m.votes.count)}
            />
          ) : null}
          {m.recent_votes.length ? (
            <Block>
              <Text variant="subsectionTitle" accessibilityRole="header">
                {c.recent}
              </Text>
              {m.recent_votes.map((v, i) => (
                <LinkRow
                  key={`${v.href}:${i}`}
                  testID={`vic-seat-vote-${i}`}
                  title={v.title}
                  titleRole="rowRecord"
                  detail={shortDate(v.date)}
                  secondary={
                    <StatusCapsule
                      status="neutral"
                      label={c.positions[v.vote] ?? v.vote}
                    />
                  }
                  href={fromWebPath(v.href) ?? undefined}
                  onPress={
                    fromWebPath(v.href)
                      ? undefined
                      : () => void openSource(v.href)
                  }
                />
              ))}
            </Block>
          ) : null}
          <LinkRow
            testID="vic-seat-speeches"
            title={c.speeches}
            href={personSpeechesRoute(m.slug)}
          />
        </>
      )}
      <MemberSource record={record} />
    </Block>
  );
}

/**
 * A ValueRow with a second line under its label: "Votes recorded in 2026"
 * over "6 for, 3 against", the count trailing. One element to VoiceOver.
 * Stacks at accessibility sizes as ValueRow does.
 */
function VoteCountRow({
  label,
  detail,
  value,
}: {
  label: string;
  detail: string;
  value: string;
}) {
  const stacked = useAccessibilitySize();
  const cell = useRowCellStyle();
  useRowInset();
  return (
    <View
      accessible
      accessibilityLabel={spokenFigures(`${label}, ${value}. ${detail}`)}
      testID="vic-seat-votes"
      style={[styles.row, stacked ? styles.stacked : null, cell]}
    >
      <View style={[styles.words, stacked ? null : styles.grow]}>
        <Text wordSafe variant="body">
          {label}
        </Text>
        <Text wordSafe variant="secondary" testID="vic-seat-votes-split">
          {detail}
        </Text>
      </View>
      <Text
        wordSafe
        variant="strong"
        tabular
        style={stacked ? undefined : styles.value}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  words: { gap: rhythm.line, flexShrink: 1 },
  grow: { flex: 1 },
  value: { flexShrink: 0, textAlign: 'right' },
});
