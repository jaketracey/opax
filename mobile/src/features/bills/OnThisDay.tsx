import { billName } from '../../api/bill-transforms';
import { useAccessibilitySize } from '../../design/accessibility';
import { formatDate } from '../../design/format';
import { LinkRow } from '../../design/rows';
import { Text } from '../../design/text';
import { billRoute } from '../../navigation/routes';
import { presentSheet } from '../../navigation/sheets';
import { ON_THIS_DAY_RULE, type OnThisDayBill } from './on-this-day';

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
  onSelect,
}: {
  pick: OnThisDayBill;
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
        <Text wordSafe variant="footnote" tone="inkSoft">
          {kicker}
        </Text>
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
      accessibilityLabel={`${kicker}, ${name}, introduced ${formatDate(pick.date)}`}
      accessibilityHint="Opens the bill"
      testID="bills-on-this-day-row"
    />
  );
}
