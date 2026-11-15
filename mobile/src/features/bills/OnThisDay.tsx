import { billName } from '../../api/bill-transforms';
import {
  useAccessibilitySize,
  useReduceMotion,
} from '../../design/accessibility';
import { formatDate } from '../../design/format';
import { HeightReveal } from '../../design/reveal';
import { LinkRow } from '../../design/rows';
import { Text } from '../../design/text';
import { billRoute } from '../../navigation/routes';
import { presentSheet } from '../../navigation/sheets';
import { ON_THIS_DAY_RULE, type OnThisDayBill } from './on-this-day';

/**
 * On this day, in the Bills list's header: "On this day in 2018", the bill's
 * name and "Introduced 15 November 2018". One link to the bill's own page,
 * where its ParlInfo sources are; the rule is behind a long press. Absent
 * when no bill was introduced on this date in an earlier year. It arrives
 * with the list, so its height eases open (at once under Reduce Motion).
 */
export function OnThisDayRow({
  pick,
  onSelect,
  gap = 0,
}: {
  pick: OnThisDayBill | null;
  /** Two panes: select the bill beside the list instead of pushing it. */
  onSelect?: (pick: OnThisDayBill) => void;
  gap?: number;
}) {
  const reduceMotion = useReduceMotion();
  const large = useAccessibilitySize();
  const name = pick ? billName(pick.bill) : '';
  const kicker = pick ? `On this day in ${pick.year}` : '';
  const introduced = pick ? `Introduced ${formatDate(pick.date)}` : '';
  return (
    <HeightReveal
      reduceMotion={reduceMotion}
      gap={gap}
      testID="bills-on-this-day"
    >
      {pick ? (
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
      ) : null}
    </HeightReveal>
  );
}
