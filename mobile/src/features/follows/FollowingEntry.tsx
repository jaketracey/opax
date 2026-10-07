import { router } from 'expo-router';
import { Button, Section, Text } from '../../design/primitives';
import { formatCount } from '../../design/format';
import { followsRoute } from '../../navigation/routes';
import { useFollows } from './store';

/** Your MP's way in to the follows saved on this iPhone. */
export function FollowingEntry() {
  const follows = useFollows();
  if (follows === null) return null;
  return (
    <Section title="Following" testID="your-following">
      <Text wordSafe testID="your-following-count">
        {follows.length
          ? `${formatCount(follows.length)} ${follows.length === 1 ? 'follow' : 'follows'} saved on this iPhone. Today shows what changed in each.`
          : 'Nothing followed yet. Follow a parliamentarian, party, bill or electorate from its page.'}
      </Text>
      <Button
        label="Manage follows"
        testID="your-following-manage"
        onPress={() => router.push(followsRoute)}
      />
    </Section>
  );
}
