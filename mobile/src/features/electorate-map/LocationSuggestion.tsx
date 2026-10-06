import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { Electorate } from '../../api/catalogs';
import { Button, Group, Text } from '../../design/primitives';
import { suggestFromLocation } from './location';
import type { Suggestion } from './suggestion';
const messages = {
  denied: 'Location access is off. Search by electorate or member name below.',
  border:
    'Your location may be near a border, or too approximate to suggest one seat. Choose your electorate below.',
  'no-match':
    'No federal display outline matches your location. You may be offshore or outside the covered area. Choose your electorate below.',
  unavailable:
    'A location suggestion is unavailable. Choose your electorate below.',
};
export function LocationSuggestion({
  seats,
  onConfirm,
  disabled,
}: {
  seats: Electorate[];
  onConfirm: (seat: Electorate) => void;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [result, setResult] = useState<Suggestion | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function locate() {
    if (pending.current || disabled) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setResult(null);
    setProgress('Preparing a location suggestion');
    const outcome = await suggestFromLocation(
      seats,
      (done, total) => {
        if (!controller.signal.aborted)
          setProgress(
            done === total
              ? 'Checking once on your iPhone'
              : `Preparing federal outlines ${done} of ${total}`,
          );
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
          : messages[outcome.kind],
      );
    }
  }
  return (
    <Group>
      <Button
        label="Use my location"
        testID="use-my-location"
        onPress={() => void locate()}
        disabled={busy || disabled}
        accessibilityHint="Optional. Suggests a federal electorate using a display outline; you confirm the choice."
      />
      <Text wordSafe variant="fine">
        Your location is used once on your iPhone to suggest a federal seat. It
        is not sent, saved or logged. Display outlines are not for address
        allocation.
      </Text>
      {busy ? (
        <Group>
          <Text
            wordSafe
            accessibilityLiveRegion="polite"
            testID="location-progress"
          >
            {progress}
          </Text>
          <Button
            label="Cancel location suggestion"
            testID="location-cancel"
            onPress={() => {
              pending.current?.abort();
              pending.current = null;
              setBusy(false);
              setProgress('');
            }}
          />
        </Group>
      ) : null}
      {result?.kind === 'suggested' ? (
        <Group>
          <Text wordSafe testID="location-suggestion">
            Your location looks like it&apos;s in {result.seat.name}. Confirm or
            choose another.
          </Text>
          <Text wordSafe variant="fine">
            Suggestion from AEC {result.vintage} display outlines. Boundaries
            may have changed; confirm your seat.
          </Text>
          <Button
            label={`Confirm ${result.seat.name}`}
            testID="location-confirm"
            disabled={disabled}
            onPress={() => onConfirm(result.seat)}
          />
          <Button
            label="Choose another"
            testID="location-choose-another"
            onPress={() => setResult(null)}
          />
        </Group>
      ) : result ? (
        <Text
          wordSafe
          accessibilityLiveRegion="polite"
          testID={`location-${result.kind}`}
        >
          {messages[result.kind]}
        </Text>
      ) : null}
    </Group>
  );
}
