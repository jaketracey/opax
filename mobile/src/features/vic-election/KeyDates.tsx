import { View } from 'react-native';
import { LinkRow } from '../../design/rows';
import { Text } from '../../design/text';
import { minimumTarget, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { vicCopy as c } from './copy';
import type { Overview } from './decoders';
import { keyDateWords, phase, type ElectionContext } from './model';
import { Block } from './shared';
export function KeyDates({
  o,
  now,
  context = o,
}: {
  o: Overview;
  now: Date;
  context?: ElectionContext;
}) {
  if (phase(context, now) === 'closed') return null;
  return (
    <Block title={c.dates} testID="vic-election-dates">
      {o.key_dates.map((row) => {
        const words = keyDateWords(row, now);
        const label = `${words.label}. ${words.when.replace(/–/g, ' to ')}.${row.link ? ` ${c.vecWebsite}` : ''}`;
        return row.link ? (
          <LinkRow
            key={row.id}
            testID={`vic-election-date-${row.id}`}
            title={words.label}
            titleRole="strong"
            detail={words.when}
            external
            accessibilityLabel={label}
            onPress={() => void openSource(row.link!.url)}
          />
        ) : (
          <View
            key={row.id}
            testID={`vic-election-date-${row.id}`}
            accessible
            accessibilityLabel={label}
            style={{
              minHeight: minimumTarget,
              gap: rhythm.line,
              paddingVertical: rhythm.tight,
            }}
          >
            <Text wordSafe variant="strong">
              {words.label}
            </Text>
            <Text wordSafe variant="secondary" tone="inkSoft">
              {words.when}
            </Text>
          </View>
        );
      })}
    </Block>
  );
}
