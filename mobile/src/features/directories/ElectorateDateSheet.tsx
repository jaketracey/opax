import { RouteOptions } from '../../navigation/preview';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { headerItems } from '../../navigation/chrome';
import { colors, rhythm } from '../../design/tokens';
import { copy } from '../../design/copy';
import { formatDate } from '../../design/format';
import { LinkRow } from '../../design/rows';
import { loadElectorate } from '../Electorate';
import { validDate } from './model';

type Listener = (id: string, date: string) => void;
const listeners = new Set<Listener>();
/**
 * The electorate page hears the chosen date here: the sheet is a separate
 * route, and the page (or an embedded pane) keeps the date it shows.
 */
export function onElectorateDate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function chooseElectorateDate(id: string, date: string) {
  listeners.forEach((listener) => listener(id, date));
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayDate = (iso: string) => new Date(`${iso}T12:00:00`);

/**
 * "View on a date": one inline calendar between the earliest recorded
 * start in the file and today. Cancel closes; Done shows the members on
 * the chosen date.
 */
export default function ElectorateDateSheet() {
  const { id, asof } = useLocalSearchParams<{ id: string; asof?: string }>();
  const today = isoDay(new Date());
  const initial = asof && validDate(asof) ? asof : today;
  const [date, setDate] = useState(initial);
  const [earliest, setEarliest] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadElectorate(id)
      .then(({ view }) => {
        const first = view.terms
          .map((t) => t.start)
          .filter((s): s is string => !!s && validDate(s))
          .sort()[0];
        if (active && first) setEarliest(first);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [id]);
  const changed = date !== initial;
  return (
    <View
      testID="electorate-date-sheet"
      style={{
        flex: 1,
        backgroundColor: colors.sunken,
        padding: rhythm.block,
      }}
    >
      <RouteOptions
        options={{
          title: 'View on a date',
          unstable_headerLeftItems: () => [
            {
              type: 'button',
              label: copy.cancel,
              variant: 'plain',
              tintColor: colors.navy,
              onPress: () => router.back(),
            },
          ],
          ...headerItems(() => [
            {
              type: 'button',
              label: copy.done,
              variant: 'plain',
              tintColor: colors.navy,
              labelStyle: { fontWeight: changed ? '600' : '400' },
              onPress: () => {
                router.back();
                chooseElectorateDate(id, date === today ? '' : date);
              },
            },
          ]),
        }}
      />
      {Platform.OS === 'android' ? (
        <LinkRow
          title="Date"
          detail={formatDate(date)}
          onPress={() =>
            DateTimePickerAndroid.open({
              value: dayDate(date),
              mode: 'date',
              display: 'calendar',
              minimumDate: earliest ? dayDate(earliest) : undefined,
              maximumDate: dayDate(today),
              onValueChange: (_, next) => setDate(isoDay(next)),
            })
          }
          testID="electorate-date-open"
        />
      ) : (
        <DateTimePicker
          testID="electorate-date-picker"
          accessibilityLabel="View on a date"
          value={dayDate(date)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
          minimumDate={earliest ? dayDate(earliest) : undefined}
          maximumDate={dayDate(today)}
          onValueChange={(_, next) => {
            if (next) setDate(isoDay(next));
          }}
        />
      )}
    </View>
  );
}
