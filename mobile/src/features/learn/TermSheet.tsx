import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Button } from '../../design/controls';
import { Text } from '../../design/text';
import { minimumTarget } from '../../design/tokens';
import { InsetGroup } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { MissingPayload, SheetFrame } from '../sheets/frame';
import { openOriginal, Paragraphs } from '../sheets/SourceSheet';
import { learnCopy } from './copy';
import { glossaryTerm, isTermId, termTitle } from './glossary';
import { glossaryRoute } from './routes';
import { setUnderlineTerms, useUnderlineTerms } from './settings';

/**
 * `/term?id=`: one glossary term's answer (README 8.2, B's sheet). The term
 * as the title; the guide's one line and its longer answer; "See it in OPAX"
 * where the guide names a real record; then the A to Z glossary. Every word
 * comes from content/learn/glossary.json.
 *
 * Opened above the welcome, the electorate step or Account (`over=1`), the
 * sheet can't push a tab page beneath: the record opens in the browser
 * sheet, and the glossary row is left out.
 */
export default function TermSheet() {
  const { id, over } = useLocalSearchParams<{ id?: string; over?: string }>();
  if (!isTermId(id))
    return (
      <SheetFrame title={learnCopy.name} short compact testID="term-sheet">
        <MissingPayload />
      </SheetFrame>
    );
  const term = glossaryTerm(id);
  const above = over === '1';
  const example = term.example;
  return (
    <SheetFrame title={termTitle(id)} short compact testID={`term-${id}-sheet`}>
      <InsetGroup>
        <Paragraphs paragraphs={[term.short, term.more]} />
      </InsetGroup>
      {example ? (
        <InsetGroup header={learnCopy.seeIt}>
          <LinkRow
            title={example.label}
            titleLines={0}
            onPress={() =>
              openOriginal({ url: example.url, label: example.label }, above)
            }
            testID={`term-${id}-example`}
          />
        </InsetGroup>
      ) : null}
      {above ? null : (
        <InsetGroup>
          <LinkRow
            title={learnCopy.glossary}
            symbol="books.vertical"
            onPress={() => {
              router.back();
              router.push(glossaryRoute);
            }}
            testID={`term-${id}-glossary`}
          />
        </InsetGroup>
      )}
      <HideTips id={id} />
    </SheetFrame>
  );
}

/** Whether a screen reader is running; null until the system has answered. */
function useScreenReader(): boolean | null {
  const [running, setRunning] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (next) => {
        if (active) setRunning(next);
      },
    );
    Promise.resolve(AccessibilityInfo.isScreenReaderEnabled()).then(
      (next) => {
        // A change heard meanwhile is newer than this first answer.
        if (active) setRunning((known) => known ?? !!next);
      },
      () => {
        if (active) setRunning((known) => known ?? false);
      },
    );
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);
  return running;
}

/**
 * How long the notice stays before the sheet closes itself (ms): long
 * enough to read two short sentences without hurrying.
 */
export const TIPS_HIDDEN_HOLD = 4000;

/**
 * "Hide tips", last on every answer sheet while the tips are on (Jake,
 * build 76): one tap turns the inline tips off across the app, the same
 * device-only setting as Account › Glossary terms › Glossary tips, where
 * they come back. The notice takes the button's own place and height, so
 * nothing in the sheet moves; VoiceOver hears it; then the sheet closes.
 * The A to Z glossary and this sheet stay reachable from the guide.
 */
function HideTips({ id }: { id: string }) {
  const on = useUnderlineTerms();
  const [hidden, setHidden] = useState(false);
  const reader = useScreenReader();
  useEffect(() => {
    // With VoiceOver or TalkBack running the sheet stays: the notice is
    // being read out, and a sheet that closed under it would cut it off
    // and move the focus. The reader closes it with Done. Until the system
    // has said whether one is running, nothing is timed either.
    if (!hidden || reader !== false) return;
    const timer = setTimeout(() => {
      // The stack's own dismiss: with Reduce Motion it is the system's.
      if (router.canGoBack()) router.back();
    }, TIPS_HIDDEN_HOLD);
    return () => clearTimeout(timer);
  }, [hidden, reader]);
  // Tips already off (the sheet opened from the A to Z glossary): nothing
  // to hide.
  if (!on && !hidden) return null;
  return (
    <View style={styles.hide}>
      {/* The notice is laid out from the start, unseen, so the slot is its
          height at every text size: the sheet is fitted and scrolls to it
          before the tap, and nothing grows when it appears (at AX3 it is
          three lines, and it used to run off the sheet's foot). */}
      <Text
        wordSafe
        variant="secondary"
        tone="inkSoft"
        // Read out once, by the announcement below, on both platforms. Not
        // a live region: TalkBack reads one when its words change, and these
        // words are here from the start (unseen), so it would stay silent,
        // or read twice beside the announcement.
        accessibilityElementsHidden={!hidden}
        importantForAccessibility={hidden ? 'yes' : 'no-hide-descendants'}
        style={hidden ? undefined : styles.unseen}
        testID={hidden ? `term-${id}-tips-hidden` : `term-${id}-tips-reserved`}
      >
        {learnCopy.tipsHidden}
      </Text>
      {hidden ? null : (
        <View style={styles.button}>
          <Button
            label={learnCopy.hideTips}
            variant="plain"
            onPress={() => {
              setHidden(true);
              void setUnderlineTerms(false);
              AccessibilityInfo.announceForAccessibility(learnCopy.tipsHidden);
            }}
            testID={`term-${id}-hide-tips`}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // The button's 44 pt row at least, and the notice's own height where that
  // is more. Both start on the text's leading edge.
  hide: { minHeight: minimumTarget, justifyContent: 'center' },
  // From the top of the held place: where the notice is taller than the
  // button (large text), the spare room falls below the button, not as a
  // gap between it and the row above.
  button: {
    ...StyleSheet.absoluteFill,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  // Laid out, not drawn: it holds the notice's place.
  unseen: { opacity: 0 },
});
