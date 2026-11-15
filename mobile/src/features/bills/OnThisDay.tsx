import { StyleSheet, View } from 'react-native';
import { billName } from '../../api/bill-transforms';
import { useAccessibilitySize } from '../../design/accessibility';
import { formatDate } from '../../design/format';
import { chamberName } from '../../design/parliament';
import type { RowMenuAction } from '../../design/row-link';
import { LinkRow } from '../../design/rows';
import { Text } from '../../design/text';
import { billRoute } from '../../navigation/routes';
import { presentSheet } from '../../navigation/sheets';
import { docRoute } from '../../navigation/routes/records';
import { stageTitle } from './divisions';
import {
  ON_THIS_DAY_DIVISION_RULE,
  ON_THIS_DAY_RULE,
  ON_THIS_DAY_SPEECH_RULE,
  type OnThisDayBill,
  type OnThisDayDivisionPick,
  type OnThisDaySpeechPick,
} from './on-this-day';

/**
 * On this day, the last thing in the Bills list's header, directly above the
 * first bill: "On this day in 2018", the bill's name and "Introduced
 * 15 November 2018". One link to the bill's own page, where its ParlInfo
 * sources are; the rule is behind a long press.
 *
 * The list decides it once, in the frame the bills first draw, so it never
 * arrives later and nothing already on screen moves for it. No bill
 * introduced on this date in an earlier year: no row and no gap.
 */
export function OnThisDayRow({
  pick,
  passed = false,
  onSelect,
}: {
  pick: OnThisDayBill;
  /**
   * The list has stayed in view into a new day (useOnThisDay). The row keeps
   * its bill and its exact size, and its top line gives the bill's own date
   * instead of "On this day", which would no longer be true.
   */
  passed?: boolean;
  /** Two panes: select the bill beside the list instead of pushing it. */
  onSelect?: (pick: OnThisDayBill) => void;
}) {
  const large = useAccessibilitySize();
  const name = billName(pick.bill);
  const kicker = `On this day in ${pick.year}`;
  const introduced = `Introduced ${formatDate(pick.date)}`;
  return (
    <LinkRow
      symbol="calendar"
      aboveTitle={
        <DayKicker
          kicker={kicker}
          date={pick.date}
          passed={passed}
          testID="bills-on-this-day"
        />
      }
      title={name}
      titleLines={large ? undefined : 2}
      detail={introduced}
      href={billRoute(pick.bill.key, name)}
      select={onSelect ? () => onSelect(pick) : undefined}
      menu={[
        {
          title: 'How this is chosen',
          symbol: 'info.circle',
          onPress: () =>
            presentSheet({
              kind: 'rule',
              title: 'How this is chosen',
              rule: ON_THIS_DAY_RULE,
            }),
        },
      ]}
      accessibilityLabel={
        passed
          ? `${name}, introduced ${formatDate(pick.date)}`
          : `${kicker}, ${name}, introduced ${formatDate(pick.date)}`
      }
      accessibilityHint="Opens the bill"
      testID="bills-on-this-day-row"
    />
  );
}

/**
 * The "On this day in 2018" line. It always holds the space. Once its day
 * has passed it is hidden, not removed, and the record's own date is drawn
 * over it out of the layout: the row's height cannot change.
 */
function DayKicker({
  kicker,
  date,
  passed,
  testID,
}: {
  kicker: string;
  date: string;
  passed: boolean;
  testID: string;
}) {
  return (
    <View>
      <Text
        wordSafe
        variant="footnote"
        tone="inkSoft"
        testID={`${testID}-kicker`}
        style={passed ? styles.held : undefined}
      >
        {kicker}
      </Text>
      {passed ? (
        <Text
          wordSafe
          variant="footnote"
          tone="inkSoft"
          testID={`${testID}-date`}
          style={styles.over}
        >
          {formatDate(date)}
        </Text>
      ) : null}
    </View>
  );
}

const howChosen = (rule: string): RowMenuAction[] => [
  {
    title: 'How this is chosen',
    symbol: 'info.circle',
    onPress: () =>
      presentSheet({ kind: 'rule', title: 'How this is chosen', rule }),
  },
];

/**
 * On this day, a division on a bill: the bill, the house and the recorded
 * stage, its date and They Vote For You. It opens the vote on the bill's
 * page. No result and no count: the row says what the record is, and the
 * record says the rest. Same first-frame and passed-day rules as the bill.
 */
export function OnThisDayDivisionRow({
  pick,
  passed = false,
  onSelectBill,
}: {
  pick: OnThisDayDivisionPick;
  passed?: boolean;
  /** Two panes: select the bill beside the list instead of pushing it. */
  onSelectBill?: (key: string, title: string) => void;
}) {
  const large = useAccessibilitySize();
  const { division, billName: bill } = pick;
  const stage = stageTitle(division.stage)?.toLocaleLowerCase('en-AU');
  const words = `${chamberName(division.house) ?? 'Chamber not recorded'} division${stage ? `, ${stage}` : ''}`;
  const kicker = `On this day in ${pick.year}`;
  const said = `${bill}, ${words}, ${formatDate(division.date)}, They Vote For You`;
  return (
    <LinkRow
      symbol="hand.raised"
      aboveTitle={
        <DayKicker
          kicker={kicker}
          date={division.date}
          passed={passed}
          testID="bills-on-this-day-division"
        />
      }
      title={bill}
      titleLines={large ? undefined : 2}
      detail={`${words}, ${formatDate(division.date)} · They Vote For You`}
      href={billRoute(division.bill, bill, { division: division.key })}
      select={
        onSelectBill ? () => onSelectBill(division.bill, bill) : undefined
      }
      menu={howChosen(ON_THIS_DAY_DIVISION_RULE)}
      accessibilityLabel={passed ? said : `${kicker}, ${said}`}
      accessibilityHint="Opens the vote on the bill"
      testID="bills-on-this-day-division"
    />
  );
}

/**
 * On this day, a speech on a bill: the speaker, the bill, its date and
 * Hansard. It opens the speech. No party and no summary.
 */
export function OnThisDaySpeechRow({
  pick,
  passed = false,
}: {
  pick: OnThisDaySpeechPick;
  passed?: boolean;
}) {
  const large = useAccessibilitySize();
  const { speech, billName: bill } = pick;
  const kicker = `On this day in ${pick.year}`;
  const said = `${speech.speaker} spoke on the ${bill}, ${formatDate(speech.date)}, Hansard`;
  return (
    <LinkRow
      symbol="text.bubble"
      aboveTitle={
        <DayKicker
          kicker={kicker}
          date={speech.date}
          passed={passed}
          testID="bills-on-this-day-speech"
        />
      }
      title={speech.speaker}
      titleLines={large ? undefined : 2}
      detail={`Spoke on the ${bill}, ${formatDate(speech.date)} · Hansard`}
      detailLines={large ? undefined : 3}
      href={docRoute(speech.slug, speech.speaker)}
      menu={howChosen(ON_THIS_DAY_SPEECH_RULE)}
      accessibilityLabel={passed ? said : `${kicker}, ${said}`}
      accessibilityHint="Opens the speech"
      testID="bills-on-this-day-speech"
    />
  );
}

const styles = StyleSheet.create({
  held: { opacity: 0 },
  over: { position: 'absolute', top: 0, left: 0, right: 0 },
});
