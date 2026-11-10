import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { StatusCapsule } from '../../design/labels';
import { Icon } from '../../design/icon';
import { symbols } from '../../design/symbols';
import { RowLink } from '../../design/row-link';
import { Text } from '../../design/text';
import { useAccessibilitySize } from '../../design/accessibility';
import { formatDate } from '../../design/format';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { NewDot } from '../follows/NewDot';

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
  const status = position === 'for' ? 'Voted for' : 'Voted against';
  const meta = date ? `${stage} · ${formatDate(date, 'short')}` : stage;
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
          {name}
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
          pressed ? { backgroundColor: colors.sunken } : null
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
