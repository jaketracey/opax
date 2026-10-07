import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Group, Icon, Text, haptic } from '../../design/primitives';
import { colors, minimumTarget, spacing } from '../../design/tokens';
import {
  FOLLOW_LIMIT,
  follow,
  followKey,
  unfollow,
  useFollows,
  type FollowKind,
} from './store';
import { markSeenNow } from './useFollowStates';

/**
 * Follow or unfollow a parliamentarian, bill or electorate on this iPhone. A
 * switch for VoiceOver ("Follow Grayndler, switch button, on"). Opening the
 * page of something followed marks it seen.
 */
export function FollowToggle({
  kind,
  id,
  title,
  testID,
}: {
  kind: FollowKind;
  id: string;
  title: string;
  /** E2E reads the state from the suffix: `<testID>-on` or `<testID>-off`. */
  testID: string;
}) {
  const follows = useFollows();
  const key = followKey({ kind, id });
  const current = follows?.find((f) => followKey(f) === key);
  const following = !!current;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const marked = useRef(false);
  useEffect(() => {
    if (!current) marked.current = false;
    else if (!marked.current) {
      marked.current = true;
      void markSeenNow(current);
    }
  }, [current]);
  async function toggle() {
    setBusy(true);
    setMessage(null);
    try {
      if (following) {
        await unfollow(key);
        haptic('selection');
      } else if ((await follow({ kind, id, title })) === 'limit')
        setMessage(
          `You are following ${FOLLOW_LIMIT} items, the most this app keeps. Unfollow one under Manage follows to add another.`,
        );
      else haptic('success');
    } catch {
      setMessage('Your follows could not be saved on this iPhone. Try again.');
    } finally {
      setBusy(false);
    }
  }
  const inert = busy || follows === null;
  return (
    <Group gap={spacing.s3}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={`Follow ${title}`}
        accessibilityState={{ checked: following, disabled: inert }}
        testID={`${testID}-${following ? 'on' : 'off'}`}
        disabled={inert}
        hitSlop={4}
        onPress={() => void toggle()}
        style={({ pressed }) => [
          styles.toggle,
          following
            ? { backgroundColor: pressed ? colors.navyRaised : colors.navy }
            : { backgroundColor: pressed ? colors.sunken : colors.navyWash },
        ]}
      >
        <Icon
          name={following ? 'checkmark' : 'plus'}
          size={16}
          tone={following ? 'onNavy' : 'navy'}
        />
        <Text
          variant="control"
          tone={following ? 'onNavy' : 'navy'}
          wordSafe
          style={styles.label}
        >
          {following ? 'Following' : 'Follow'}
        </Text>
      </Pressable>
      {message ? (
        <Text wordSafe variant="fine" testID={`${testID}-message`}>
          {message}
        </Text>
      ) : null}
    </Group>
  );
}
const styles = StyleSheet.create({
  // A capsule, as iOS draws Follow: 40pt drawn, 48pt with its hit slop.
  toggle: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minWidth: minimumTarget,
    minHeight: 40,
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  label: { flexShrink: 1 },
});
