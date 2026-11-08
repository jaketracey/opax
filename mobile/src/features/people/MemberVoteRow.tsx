import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { StatusCapsule } from '../../design/labels';
import { Icon } from '../../design/icon';
import { RowLink } from '../../design/row-link';
import { Text } from '../../design/text';
import { useAccessibilitySize } from '../../design/accessibility';
import { formatDate } from '../../design/format';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { NewDot } from '../follows/NewDot';

/**
 * One member's position on one named bill at one stage (people.md 2.1):
 * "Voted for" or "Voted against" as a neutral capsule, the bill's title in
 * the record face, "{Stage} · {d MMM yyyy}", and a chevron to the division
 * on the bill's page. A vote not matched to a bill is the same row, static.
 */
export function MemberVoteRow({
  position,
  name,
  stage,
  date,
  href,
  isNew = false,
  testID,
}: {
  position: 'for' | 'against';
  name: string;
  stage: string;
  date: string | null;
  href?: Href;
  isNew?: boolean;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const status = position === 'for' ? 'Voted for' : 'Voted against';
  const meta = date ? `${stage} · ${formatDate(date, 'short')}` : stage;
  const spoken = `${status}. ${name}. ${date ? `${stage}, ${formatDate(date)}` : stage}`;
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
      {href ? (
        <Icon name="chevron.right" size={13} maxScale={1.5} tone="inkFaint" />
      ) : null}
    </View>
  );
  return href ? (
    <RowLink href={href}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Opens the bill"
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
