import { phoneCopy } from '../../design/phone-copy';
import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  EmptyState,
  Group,
  LoadingState,
  RowList,
  Screen,
  Section,
  SubSection,
  Text,
} from '../../design/primitives';
import { formatCount, formatDate } from '../../design/format';
import { RecordRow } from '../RecordRow';
import { routeFor } from './FollowingSection';
import {
  FOLLOW_LIMIT,
  clearFollows,
  followKey,
  unfollow,
  useFollows,
  type FollowKind,
} from './store';

const groups: [FollowKind, string][] = [
  ['person', 'Parliamentarians'],
  ['party', 'Parties'],
  ['bill', 'Bills'],
  ['electorate', 'Electorates'],
];
const failed = phoneCopy(
  'Your follows could not be saved on this iPhone. Try again.',
);

/** The follows saved on this iPhone: open one, unfollow one or clear them all. */
export default function ManageFollows() {
  const follows = useFollows();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(change: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await change();
    } catch {
      setError(failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen testID="follows-screen">
      <Group>
        <Text wordSafe variant="metadata" testID="follows-privacy">
          {phoneCopy(
            'Follows are saved on this iPhone only. Nothing about them is sent to OPAX or anyone else. Device backups may include them.',
          )}
        </Text>
      </Group>
      {error ? (
        <Text wordSafe testID="follows-error">
          {error}
        </Text>
      ) : null}
      {follows === null ? (
        <LoadingState label="Loading your follows" />
      ) : !follows.length ? (
        <EmptyState
          message="You are not following anything. Use Follow on a parliamentarian, bill or electorate."
          testID="follows-empty"
        />
      ) : (
        <>
          <Text wordSafe variant="strong" testID="follows-count">
            Following {formatCount(follows.length)} of at most{' '}
            {formatCount(FOLLOW_LIMIT)}
          </Text>
          {groups.map(([kind, title]) => {
            const rows = follows.filter((f) => f.kind === kind);
            return rows.length ? (
              <SubSection key={kind} title={title} testID={`follows-${kind}`}>
                <RowList>
                  {rows.map((f) => (
                    <Group key={followKey(f)} gap={8}>
                      <RecordRow
                        title={f.title}
                        detail={`Followed ${formatDate(f.followedAt, 'short')}`}
                        onPress={() => router.push(routeFor(f))}
                        testID={`follows-open-${f.kind}-${f.id}`}
                      />
                      <Button
                        label={`Unfollow ${f.title}`}
                        variant="quiet"
                        size="compact"
                        icon="minus.circle"
                        disabled={busy}
                        testID={`follows-unfollow-${f.kind}-${f.id}`}
                        onPress={() => void run(() => unfollow(followKey(f)))}
                      />
                    </Group>
                  ))}
                </RowList>
              </SubSection>
            ) : null;
          })}
          <Section>
            <Button
              label="Unfollow all"
              variant="danger"
              disabled={busy}
              testID="follows-clear"
              onPress={() =>
                Alert.alert(
                  `Unfollow all ${formatCount(follows.length)}?`,
                  phoneCopy(
                    'They are removed from this iPhone, and Today stops showing their changes.',
                  ),
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Unfollow',
                      style: 'destructive',
                      onPress: () => void run(clearFollows),
                    },
                  ],
                )
              }
            />
          </Section>
        </>
      )}
      <Text wordSafe variant="fine" testID="follows-end">
        {phoneCopy(
          'Today compares each follow with the published records when you open the app or pull to refresh. The comparison runs on this iPhone.',
        )}
      </Text>
    </Screen>
  );
}
