import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { recentBillsFor } from '../../api/selectors';
import { billSentenceCase } from '../../api/bill-transforms';
import { formatDate } from '../../design/format';
import {
  Hoverable,
  Icon,
  RowList,
  StatusLabel,
  Text,
  useAccessibilitySize,
} from '../../design/primitives';
import { ownsRowPadding } from '../../design/row-padding';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { billRoute } from '../../navigation/routes';
import { shortDay } from './parts';

type Bill = NonNullable<ReturnType<typeof recentBillsFor>['data']>[number];

/** What a bill row says, visibly and to VoiceOver (one element). */
export function billRowText(bill: Bill) {
  const status = billSentenceCase(bill.status) || 'Status not recorded';
  const by =
    bill.portfolio ??
    ([bill.sponsor, bill.sponsor_party].filter(Boolean).join(' · ') || null);
  return {
    status,
    by,
    introduced: bill.introduced
      ? `${bill.introducedLabel} ${shortDay(bill.introduced)}`
      : null,
    label: [
      bill.title,
      status,
      bill.introduced
        ? `${bill.introducedLabel} ${formatDate(bill.introduced)}`
        : null,
      bill.portfolio ? `${bill.portfolio} portfolio` : null,
      bill.sponsor,
      bill.sponsor_party,
    ]
      .filter(Boolean)
      .join(', '),
  };
}

/**
 * One bill as a row on the paper: its status and date on one line, the
 * title in the record's serif (never cut short, never broken mid-word), who
 * brought it, and a chevron to the bill.
 */
export function BillRow({ bill, index }: { bill: Bill; index: number }) {
  const text = billRowText(bill);
  const stacked = useAccessibilitySize();
  const open = () => router.push(billRoute(bill.key));
  return (
    <Hoverable
      effect="highlight"
      onActivate={open}
      drag={{ path: `/bill/${bill.key}`, title: bill.title }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text.label}
        accessibilityHint="Opens the bill"
        testID={`today-bill-${index}`}
        onPress={open}
        style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      >
        <View style={styles.main}>
          <View style={[styles.meta, stacked ? styles.metaStacked : null]}>
            <StatusLabel label={text.status} hidden />
            {text.introduced ? (
              <Text wordSafe variant="fine">
                {text.introduced}
              </Text>
            ) : null}
          </View>
          <Text wordSafe variant="subheading">
            {bill.title}
          </Text>
          {text.by ? (
            <Text wordSafe variant="metadata">
              {text.by}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron.right" size={13} tone="inkSoft" />
      </Pressable>
    </Hoverable>
  );
}
ownsRowPadding(BillRow);

/** Recently introduced bills as rows on the paper, between hairlines. */
export function BillFeed({ bills }: { bills: readonly Bill[] }) {
  return (
    <RowList>
      {bills.map((bill, i) => (
        <BillRow key={bill.key} bill={bill} index={i} />
      ))}
    </RowList>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    minHeight: minimumTarget,
    paddingVertical: rhythm.tight,
  },
  pressed: { backgroundColor: colors.sunken },
  // flex: 1 would become a zero height basis if the row ever stacked.
  main: { flexGrow: 1, flexShrink: 1, gap: rhythm.line + 2 },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
    rowGap: rhythm.line,
  },
  metaStacked: { flexDirection: 'column', alignItems: 'stretch' },
});
