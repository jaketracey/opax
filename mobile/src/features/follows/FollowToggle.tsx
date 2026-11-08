import { phoneCopy } from '../../design/phone-copy';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../design/controls';
import { Group } from '../../design/layout';
import { Text } from '../../design/text';
import { haptic } from '../../design/haptics';
import { symbols } from '../../design/symbols';
import { router } from 'expo-router';
import { spacing } from '../../design/tokens';
import {
  follow,
  followKey,
  unfollow,
  useFollows,
  type FollowKind,
} from './store';
import { markSeenNow } from './useFollowStates';

/**
 * Follow or unfollow a parliamentarian, bill or electorate on this iPhone: a
 * secondary capsule (plus while off, checkmark while following), a switch for VoiceOver ("Follow Grayndler, switch button,
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
  const [bounce, setBounce] = useState(false);
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
    setBounce(false);
    setBusy(true);
    setMessage(null);
    try {
      if (following) {
        await unfollow(key);
      } else if ((await follow({ kind, id, title })) === 'limit')
        setMessage('You can follow up to 50. Unfollow one to add this.');
      else {
        setBounce(true);
        haptic('success');
      }
    } catch {
      setMessage(phoneCopy('Your follows could not be saved on this iPhone.'));
    } finally {
      setBusy(false);
    }
  }
  const inert = busy || follows === null;
  return (
    <Group gap={spacing.s3}>
      <Button
        on={following}
        variant="secondary"
        label={following ? 'Following' : 'Follow'}
        symbol={following ? symbols.following : symbols.follow}
        symbolAnimation={following && bounce ? 'bounce' : null}
        accessibilityLabel={`${following ? 'Following' : 'Follow'} ${title}`}
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
      {message === 'You can follow up to 50. Unfollow one to add this.' ? (
        <Button
          label="Edit Following"
          variant="plain"
          onPress={() => router.push('/follows?edit=1')}
          testID={`${testID}-edit-following`}
        />
      ) : null}
    </Group>
  );
}
