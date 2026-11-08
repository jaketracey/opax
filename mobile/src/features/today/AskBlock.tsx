import { View } from 'react-native';
import { InsetGroup, SectionHeader } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { symbols } from '../../design/symbols';
import { rhythm } from '../../design/tokens';
import { useOpenAsk } from '../ask/open';
import { starterList } from '../ask/starters';
import { starterPair, type SydneyDate } from './rules';

/** The day's two starters from the reviewed list, in order, wrapping. */
export const todayStarters = (
  today: SydneyDate,
  list: readonly string[] = starterList,
) => starterPair(today, list);

/**
 * Ask about parliament (today.md 5.11): two starters a day. A tap switches
 * to the Ask tab with the question in the composer, keyboard up; it never
 * submits. No source line (no figure). Absent with no reviewed list.
 */
export function AskBlock({ today }: { today: SydneyDate }) {
  const openAsk = useOpenAsk();
  const starters = todayStarters(today);
  if (!starters.length) return null;
  return (
    <View testID="today-ask" style={{ gap: rhythm.heading }}>
      <SectionHeader title="Ask about parliament" testID="today-ask-title" />
      <InsetGroup>
        {starters.map((question, i) => (
          <LinkRow
            key={question}
            title={question}
            symbol={symbols.ask}
            onPress={() => openAsk({ question })}
            accessibilityHint="Opens Ask with this question"
            testID={`today-ask-${i}`}
          />
        ))}
      </InsetGroup>
    </View>
  );
}
