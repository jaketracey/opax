import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { StatusCapsule } from '../../design/labels';
import { Icon } from '../../design/icon';
import { symbols } from '../../design/symbols';
import { RowLink } from '../../design/row-link';
import { useRowHighlight } from '../../design/row-padding';
import { Text } from '../../design/text';
import { useAccessibilitySize } from '../../design/accessibility';
import { formatDate, unbroken } from '../../design/format';
import { minimumTarget, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { NewDot } from '../follows/NewDot';

/**
 * A division on several bills is published as one name, the bills' titles
 * joined by ", " ("Treasury Laws Amendment (Tax Reform No. 1) Bill 2026,
 * Income Tax Rates Amendment (Tax Reform No. 1) Bill 2026"). Split only at
 * a top-level comma where every part is a bill's title, so a comma inside a
 * title's brackets never splits it. One bill gives one part.
 */
export function combinedBills(name: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < name.length; i++) {
    const c = name[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0 && name[i + 1] === ' ') {
      parts.push(name.slice(start, i).trim());
      start = i + 2;
    }
  }
  parts.push(name.slice(start).trim());
  const bill = /\bBills? \d{4}$/;
  return parts.length > 1 && parts.every((part) => bill.test(part))
    ? parts
    : [name];
}

/** A bill's short name: its title without the closing "Bill 2026". */
const shortBillName = (title: string) => title.replace(/\s+Bills? \d{4}$/, '');

/**
 * One member's position on one named bill at one stage (people.md 2.1):
 * "Voted for" or "Voted against" as a neutral capsule, the bill's title in
 * the record face, "{Stage} · {d MMM yyyy}", and a chevron to the division
 * on the bill's page. Unmatched votes open their original in the in-app browser.
 */
export function MemberVoteRow({
  position,
  name,
  stage,
  date,
  href,
  url,
  isNew = false,
  testID,
}: {
  position: 'for' | 'against';
  name: string;
  stage: string;
  date: string | null;
  href?: Href;
  url?: string;
  isNew?: boolean;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const status = position === 'for' ? 'Voted for' : 'Voted against';
  // A combined division leads with its first bill and names the second in
  // the meta line, so it never reads the same as its neighbour, which is
  // often the first bill alone (sweep 1, item 9). The date never breaks.
  const [title, second, ...others] = combinedBills(name);
  const companion = second
    ? `with ${shortBillName(second)}${others.length ? ` and ${others.length} more` : ''}`
    : null;
  const meta = [
    stage,
    companion,
    date ? unbroken(formatDate(date, 'short')) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // The row's own label replaces its children's, so the dot's "New" is said here.
  const spoken = `${status}. ${name}. ${date ? `${stage}, ${formatDate(date)}` : stage}${isNew ? '. New' : ''}`;
  const select =
    !href && url
      ? () => {
          void openSource(url, name);
        }
      : undefined;
  const body = (
    <View style={styles.row}>
      {isNew ? <NewDot testID={testID ? `${testID}-new` : undefined} /> : null}
      <View style={styles.text}>
        <View style={stacked ? null : styles.capsule}>
          <StatusCapsule status={status} hidden />
        </View>
        <Text wordSafe variant="rowRecord">
          {title}
        </Text>
        <Text wordSafe variant="secondary">
          {meta}
        </Text>
      </View>
      {href || url ? (
        <Icon
          name={href ? symbols.chevron : symbols.external}
          size={13}
          maxScale={1.5}
          tone="inkFaint"
        />
      ) : null}
    </View>
  );
  return href || url ? (
    <RowLink href={href ?? (url as Href)} preview={!!href} select={select}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={
          href ? 'Opens the bill' : 'Opens in the in-app browser'
        }
        testID={testID}
        style={({ pressed }) =>
          pressed ? { backgroundColor: highlight } : null
        }
      >
        {body}
      </Pressable>
    </RowLink>
  ) : (
    <View accessible accessibilityLabel={spoken} testID={testID}>
      {body}
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
  text: { flex: 1, gap: rhythm.line },
  capsule: { alignSelf: 'flex-start' },
});
