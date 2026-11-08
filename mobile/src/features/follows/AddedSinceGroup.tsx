import { useRef, useState } from 'react';
import { PersonRow } from '../../design/people';
import { LinkRow } from '../../design/rows';
import { personRoute } from '../../navigation/routes';
import { View } from 'react-native';
import { InsetGroup } from '../../design/layout';
import { Text } from '../../design/text';
import { SourceLine } from '../../design/source';
import { LatestRow, latestRecord } from '../your-mp/LatestRows';
import {
  changeDate,
  changeText,
  changeAccessibilityLabel,
  type Change,
} from './changes';
import { followKey, markSeen, type Follow, type Fingerprint } from './store';
import { useSeenOnView } from './useSeenOnView';

export interface AddedSinceGroupProps {
  follow: Follow;
  changes: readonly Change[];
  testID: string;
  /** Scroll/open a same-page record. Other records have their own route. */
  onRowPress?: (change: Change) => void;
  current?: Fingerprint;
  stale?: boolean;
  savedAt?: number | null;
  unavailable?: boolean;
}
export function AddedSinceGroup({
  follow,
  changes,
  testID,
  onRowPress,
  current,
  stale,
  savedAt,
  unavailable = false,
}: AddedSinceGroupProps) {
  const ref = useRef<View>(null);
  const reading =
    current ??
    Object.fromEntries(
      changes.flatMap((c) => (c.reading ? [[c.marker, c.reading]] : [])),
    );
  // Keep the group's reading for the visit after its acknowledgement redraws.
  const key = followKey(follow);
  const nextReading = {
    key,
    changes: unavailable ? [] : changes,
    since: follow.seenAt ?? follow.followedAt,
    reading,
  };
  const [visit, setVisit] = useState(nextReading);
  const replace =
    visit.key !== key ||
    (!unavailable && !visit.changes.length && changes.length > 0);
  const displayed = replace ? nextReading : visit;
  if (replace) setVisit(nextReading);
  const shown = unavailable ? [] : displayed.changes;
  useSeenOnView(
    ref,
    shown.flatMap((c) => (c.key ? [c.key] : [])),
    (keys) => {
      if (!shown.length) return;
      const markers = new Set(shown.map((c) => c.marker));
      const reading = Object.fromEntries(
        Object.entries(displayed.reading).filter(([marker]) =>
          markers.has(marker),
        ),
      );
      void markSeen(followKey(follow), reading, keys).catch(() => undefined);
    },
  );
  if (!shown.length) return null;
  return (
    <View ref={ref} collapsable={false} testID={testID}>
      <Text variant="groupHeader">{`Added since ${changeDate(displayed.since).replace(/ \d{4}$/, '')}`}</Text>
      <InsetGroup>
        {shown.map((change, i) => {
          if (change.record?.kind === 'member' && change.record.slug)
            return (
              <PersonRow
                key={`${change.marker}-${i}`}
                name={change.record.title}
                detail={changeText(change)}
                href={personRoute(change.record.slug)}
                select={onRowPress ? () => onRowPress(change) : undefined}
                testID={`${testID}-${i}`}
              />
            );
          if (
            (change.record?.kind === 'stage' ||
              change.record?.kind === 'return') &&
            onRowPress
          )
            return (
              <LinkRow
                key={`${change.marker}-${i}`}
                title={changeText(change)}
                onPress={() => onRowPress(change)}
                testID={`${testID}-${i}`}
              />
            );
          const record =
            change.record &&
            latestRecord({ ...change.record, action: change.text });
          return record ? (
            <LatestRow
              key={change.key ?? `${change.marker}-${i}`}
              record={record}
              testID={`${testID}-${i}`}
              onPress={onRowPress ? () => onRowPress(change) : undefined}
            />
          ) : (
            <View
              key={`${change.marker}-${i}`}
              testID={`${testID}-${i}`}
              style={{ paddingVertical: 12, paddingHorizontal: 16 }}
            >
              <Text
                variant="body"
                accessibilityLabel={changeAccessibilityLabel(change)}
              >
                {changeText(change)}
              </Text>
            </View>
          );
        })}
      </InsetGroup>
      {(stale ?? shown.some((c) => c.stale)) ? (
        <SourceLine
          dateLabel={null}
          citation={[...new Set(shown.map((c) => c.citation))]}
          savedAt={
            savedAt ??
            shown.find((c) => c.savedAt)?.savedAt ??
            follow.seenAt ??
            follow.followedAt
          }
          testID={`${testID}-saved`}
        />
      ) : null}
    </View>
  );
}
