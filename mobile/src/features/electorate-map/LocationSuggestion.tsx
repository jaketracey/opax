import { phoneCopy } from '../../design/phone-copy';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import type { Electorate } from '../../api/catalogs';
import { Button, Group, Text } from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';
import { suggestFromLocation, suggestStateFromLocation } from './location';
import type { Suggestion } from './suggestion';
type Scope = 'federal' | 'state';
const messages: Record<Scope, Record<Exclude<Suggestion['kind'], 'suggested'>, string>> = {
  federal: {
    denied:
      'Location access is off. Search by electorate or member name below.',
    border:
      'Your location may be near a border, or too approximate to suggest one seat. Choose your electorate below.',
    'no-match':
      'No federal display outline matches your location. You may be offshore or outside the covered area. Choose your electorate below.',
    unavailable:
      'A location suggestion is unavailable. Choose your electorate below.',
  },
  state: {
    denied:
      'Location access is off. Search by electorate or member name below.',
    border:
      'Your location may be near a district border, or too approximate to suggest one district. Choose your electorate below.',
    'no-match':
      'No district in this state matches your location. Choose your electorate below.',
    unavailable:
      'A location suggestion is unavailable. Choose your electorate below.',
  },
};
/**
 * "Use my location" in a seat chooser. `federal` matches the release's
 * federal display outlines; `state` (TestFlight build 32) matches the state
 * and territory district outlines bundled in the app. Either way the
 * permission is asked at the tap and the fix stays on the device.
 */
export function LocationSuggestion({
  seats,
  onConfirm,
  disabled,
  scope = 'federal',
}: {
  seats: Electorate[];
  onConfirm: (seat: Electorate) => void;
  disabled: boolean;
  scope?: Scope;
}) {
  const id = scope === 'state' ? 'state-' : '';
  const said = messages[scope];
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<Progress>({ done: 0, total: 0 }),
    [result, setResult] = useState<Suggestion | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function locate() {
    if (pending.current || disabled) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setResult(null);
    setProgress({ done: 0, total: 0 });
    const outcome =
      scope === 'state'
        ? await suggestStateFromLocation(seats, controller.signal)
        : await suggestFromLocation(
            seats,
            (done, total) => {
              if (!controller.signal.aborted) setProgress({ done, total });
            },
            controller.signal,
          );
    if (!controller.signal.aborted) {
      setResult(outcome);
      setBusy(false);
      pending.current = null;
      AccessibilityInfo.announceForAccessibility(
        outcome.kind === 'suggested'
          ? `Suggested electorate: ${outcome.seat.name}. Confirm or choose another.`
          : said[outcome.kind],
      );
    }
  }
  return (
    <Group>
      <Button
        label="Use my location"
        icon="location"
        testID={`${id}use-my-location`}
        onPress={() => void locate()}
        disabled={busy || disabled}
        accessibilityHint={
          scope === 'state'
            ? 'Optional. Suggests a state district using an outline held on this device; you confirm the choice.'
            : 'Optional. Suggests a federal electorate using a display outline; you confirm the choice.'
        }
      />
      <Text wordSafe variant="fine">
        Your location is used once on your{' '}
        {Platform.OS === 'android' ? 'phone' : phoneCopy('iPhone')} to suggest a{' '}
        {scope === 'state' ? 'state district' : 'federal seat'}. It is not sent,
        saved or logged.{' '}
        {scope === 'state'
          ? 'District outlines are statistical approximations, not for address allocation.'
          : 'Display outlines are not for address allocation.'}
      </Text>
      {busy && scope === 'federal' ? (
        <Group>
          <LocationProgress {...progress} />
          <Button
            label="Cancel location suggestion"
            testID="location-cancel"
            onPress={() => {
              pending.current?.abort();
              pending.current = null;
              setBusy(false);
              setProgress({ done: 0, total: 0 });
            }}
          />
        </Group>
      ) : null}
      {result?.kind === 'suggested' ? (
        <Group>
          <Text wordSafe testID={`${id}location-suggestion`}>
            Your location looks like it&apos;s in {result.seat.name}. Confirm or
            choose another.
          </Text>
          <Text wordSafe variant="fine">
            {scope === 'state'
              ? `Suggestion from ABS ${result.vintage} statistical approximations of state districts. Boundaries may differ; confirm your district.`
              : `Suggestion from AEC ${result.vintage} display outlines. Boundaries may have changed; confirm your seat.`}
          </Text>
          <Button
            label={`Confirm ${result.seat.name}`}
            testID={`${id}location-confirm`}
            disabled={disabled}
            onPress={() => onConfirm(result.seat)}
          />
          <Button
            label="Choose another"
            testID={`${id}location-choose-another`}
            onPress={() => setResult(null)}
          />
        </Group>
      ) : result ? (
        <Text
          wordSafe
          accessibilityLiveRegion="polite"
          testID={`${id}location-${result.kind}`}
        >
          {said[result.kind]}
        </Text>
      ) : null}
    </Group>
  );
}

interface Progress {
  done: number;
  total: number;
}
const phases = () => [
  'Preparing a location suggestion',
  'Preparing federal outlines',
  phoneCopy('Checking once on your iPhone'),
];
/**
 * The outline count as a stable block: a phase label, a determinate bar and
 * "104 of 150" in tabular figures. Each line reserves the room its longest
 * wording needs (every phase label, the full count), so the block keeps one
 * height while it counts and the Cancel button below never moves, at any
 * text size. VoiceOver hears one sentence, politely.
 */
export function LocationProgress({ done, total }: Progress) {
  const labels = phases();
  const label = !total ? labels[0]! : done === total ? labels[2]! : labels[1]!;
  const count = total ? `${done} of ${total}` : '';
  const spoken = total && done < total ? `${label} ${count}` : label;
  return (
    <View
      accessible
      accessibilityLabel={spoken}
      accessibilityLiveRegion="polite"
      testID="location-progress"
      style={styles.progress}
    >
      <Reserved shown={label} all={labels} />
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${total ? Math.round((done / total) * 100) : 0}%` },
          ]}
        />
      </View>
      <Reserved
        shown={count}
        all={[total ? `${total} of ${total}` : '000 of 000']}
        variant="fine"
      />
    </View>
  );
}
/** One line of text drawn over invisible copies of every wording it may take. */
function Reserved({
  shown,
  all,
  variant = 'body',
}: {
  shown: string;
  all: string[];
  variant?: 'body' | 'fine';
}) {
  return (
    <View style={styles.stack}>
      {[shown, ...all].map((text, index) => (
        <Text
          key={index}
          wordSafe
          variant={variant}
          style={[
            styles.layer,
            index ? styles.ghost : null,
            variant === 'fine' ? styles.tabular : null,
          ]}
        >
          {text || ' '}
        </Text>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  progress: { gap: rhythm.tight },
  // Every layer takes the full width and sits over the first, so the stack
  // is as tall as its tallest wording.
  stack: { flexDirection: 'row' },
  layer: { width: '100%', marginRight: '-100%' },
  ghost: { opacity: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.sunken,
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.navy },
});
