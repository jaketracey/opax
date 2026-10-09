import { phoneCopy } from '../../design/phone-copy';
import { useEffect, useRef, useState } from 'react';
import { Button, Group, Text, haptic } from '../../design/primitives';
import { spacing } from '../../design/tokens';
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
 * Follow or unfollow a parliamentarian, bill or electorate on this iPhone: a
 * toggle Button (the default capsule with a plus, navy with a check while
 * following), a switch for VoiceOver ("Follow Grayndler, switch button,
 * on"). Opening the page of something followed marks it seen.
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
      setMessage(
        phoneCopy('Your follows could not be saved on this iPhone. Try again.'),
      );
    } finally {
      setBusy(false);
    }
  }
  const inert = busy || follows === null;
  return (
    <Group gap={spacing.s3}>
      <Button
        on={following}
        label={following ? 'Following' : 'Follow'}
        icon={following ? 'checkmark' : 'plus'}
        accessibilityLabel={`Follow ${title}`}
        size="compact"
        hitSlop={4}
        disabled={inert}
        onPress={() => void toggle()}
        testID={`${testID}-${following ? 'on' : 'off'}`}
      />
      {message ? (
        <Text wordSafe variant="fine" testID={`${testID}-message`}>
          {message}
        </Text>
      ) : null}
    </Group>
  );
}
