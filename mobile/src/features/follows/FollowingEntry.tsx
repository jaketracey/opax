import { router } from 'expo-router';
import { LinkRow, RowList, Section } from '../../design/primitives';
import { formatCount } from '../../design/format';
import { followsRoute } from '../../navigation/routes';
import { useFollows } from './store';

/** Your MP's way in to the follows saved on this iPhone. */
export function FollowingEntry() {
  const follows = useFollows();
  if (follows === null) return null;
  return (
    <Section
      title="Following"
      icon="star.fill"
      accent="leads"
      testID="your-following"
    >
      <RowList>
        <LinkRow
          title="Manage follows"
          detail={
            follows.length
              ? `${formatCount(follows.length)} ${follows.length === 1 ? 'follow' : 'follows'} saved on this iPhone. Today shows what changed in each.`
              : 'Nothing followed yet. Follow a parliamentarian, bill or electorate from its page.'
          }
          detailTestID="your-following-count"
          testID="your-following-manage"
          onPress={() => router.push(followsRoute)}
        />
      </RowList>
    </Section>
  );
}
