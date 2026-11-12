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
import { useAskNow } from '../ask/open';
import { starterList } from '../ask/starters';
import { starterPair, type SydneyDate } from './rules';

/** The day's two starters from the reviewed list, in order, wrapping. */
export const todayStarters = (
  today: SydneyDate,
  list: readonly string[] = starterList,
) => starterPair(today, list);

/**
 * Ask about parliament (today.md 5.11): two starters a day. Each row shows
 * its question, so a tap switches to the Ask tab and asks it at once in a
 * new conversation (Jake, 13 Nov; `useAskNow`). No source line (no figure).
 * Absent with no reviewed list.
 */
export function AskBlock({ today }: { today: SydneyDate }) {
  const askNow = useAskNow();
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
                askNow({ question });
              }}
              accessibilityHint="Asks this question"
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
