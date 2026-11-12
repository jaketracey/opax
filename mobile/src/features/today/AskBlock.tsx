import { PadReading } from '../../design/adaptive';
import { router } from 'expo-router';
import { View } from 'react-native';
import { designFlags } from '../../design/flags';
import { InsetGroup, SectionHeader } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { symbols } from '../../design/symbols';
import { rhythm } from '../../design/tokens';
import { track } from '../../analytics';
import { talkSignInRoute } from '../../navigation/routes/account';
import { voiceLinked } from '../../voice/linked';
import { useAccount } from '../account/store';
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
  const account = useAccount();
  const signedOut = !account.checking && account.status?.signedIn === false;
  const starters = todayStarters(today);
  if (!starters.length) return null;
  return (
    <PadReading>
      <View testID="today-ask" style={{ gap: rhythm.heading }}>
        <SectionHeader title="Ask about parliament" testID="today-ask-title" />
        <InsetGroup>
          {starters.map((question, i) => (
            <LinkRow
              key={question}
              title={question}
              symbol={symbols.ask}
              symbolInk="navy"
              onPress={() => {
                track('opax_chip', { chip_kind: 'ask', placement: 'today' });
                openAsk({ question });
              }}
              accessibilityHint="Opens Ask with this question"
              testID={`today-ask-${i}`}
            />
          ))}
          {designFlags.talkInAsk && voiceLinked ? (
            <LinkRow
              title="Talk it through"
              symbol={symbols.talk}
              symbolInk="navy"
              onPress={() => router.push(signedOut ? talkSignInRoute : '/talk')}
              accessibilityHint="Talk to OPAX about parliament"
              testID="today-voice"
            />
          ) : null}
        </InsetGroup>
      </View>
    </PadReading>
  );
}
