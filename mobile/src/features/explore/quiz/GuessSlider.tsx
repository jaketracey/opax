import {
  Host as ComposeHost,
  Slider as ComposeSlider,
} from '@expo/ui/jetpack-compose';
import {
  testID as composeTestID,
  semantics,
} from '@expo/ui/jetpack-compose/modifiers';
import { Host, Slider } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  accessibilityValue,
  disabled,
} from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import {
  InputAccessoryView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useAccessibilitySize } from '../../../design/accessibility';
import { Button, Field } from '../../../design/controls';
import { Icon } from '../../../design/icon';
import { Text } from '../../../design/text';
import { colors, minimumTarget, rhythm } from '../../../design/tokens';
import {
  formatGuess,
  fromSlider,
  guessError,
  parseGuess,
  rangeLabels,
  roundGuess,
  sliderRange,
  sliderStart,
  toSlider,
  type Guess,
  type Question,
} from '../quiz-model';
import { marks } from './marks';

const doneBar = 'quiz-number-accessory';
/** SwiftUI's slider track is inset by about half its thumb on each side. */
const trackInset = 14;

/**
 * A figure or year guess: the formatted readout (a button that turns into a
 * typed field), the native slider, and its range. A typed value is kept
 * exactly; only a drag rounds, to two significant figures.
 *
 * Android’s Compose Slider takes the same value mapping and retains typed input.
 */
export function GuessSlider({
  q,
  guess,
  revealed,
  onChange,
  onEditing,
}: {
  q: Question;
  guess: Guess | undefined;
  revealed: boolean;
  onChange: (guess: Guess) => void;
  onEditing: (editing: boolean) => void;
}) {
  const stacked = useAccessibilitySize();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const value = guess?.value ?? sliderStart(q);
  const shown = formatGuess(q, value);
  const range = sliderRange(q);
  const [low, high] = rangeLabels(q);
  const edit = (next: boolean) => {
    setEditing(next);
    setError(null);
    onEditing(next);
  };
  const done = () => {
    if (!text.trim()) return edit(false);
    const typed = parseGuess(text);
    const problem = guessError(q, typed);
    if (problem || typed === null) return setError(problem);
    onChange({ value: typed, typed: true });
    edit(false);
  };
  const drag = (position: number) => {
    if (revealed) return;
    onChange({ value: roundGuess(q, fromSlider(q, position)), typed: false });
  };
  const answer = Number(q.answer);
  const tick =
    revealed &&
    Platform.OS === 'ios' &&
    width > trackInset * 2 &&
    Number.isFinite(answer)
      ? trackInset +
        ((toSlider(q, answer) - range.min) / (range.max - range.min || 1)) *
          (width - trackInset * 2)
      : null;
  return (
    <View style={styles.block}>
      {editing && !revealed ? (
        <>
          <Field
            label="Your guess"
            value={text}
            onChangeText={(next) => {
              setText(next);
              setError(null);
            }}
            keyboardType="number-pad"
            returnKeyType="done"
            autoFocus
            error={error}
            inputAccessoryViewID={Platform.OS === 'ios' ? doneBar : undefined}
            onSubmitEditing={done}
            testID="quiz-number"
          />
          {Platform.OS === 'ios' ? (
            <InputAccessoryView nativeID={doneBar}>
              <View style={styles.accessory}>
                <Button
                  label="Done"
                  variant="plain"
                  onPress={done}
                  testID="quiz-number-done"
                />
              </View>
            </InputAccessoryView>
          ) : null}
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Your guess, ${shown}`}
          accessibilityHint={
            revealed ? undefined : 'Double-tap to type a value.'
          }
          accessibilityState={{ disabled: revealed }}
          disabled={revealed}
          onPress={() => {
            setText(guess?.typed ? String(guess.value) : '');
            edit(true);
          }}
          testID="quiz-guess-value"
          style={[styles.readout, stacked ? styles.readoutStacked : null]}
        >
          <Text
            variant="figure"
            tabular
            tone={guess ? 'ink' : 'inkSoft'}
            style={styles.figure}
          >
            {shown}
          </Text>
          {revealed ? null : (
            <Icon name={marks.typeGuess} size={20} tone="navy" maxScale={1.5} />
          )}
        </Pressable>
      )}
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {Platform.OS === 'ios' ? (
          <Host
            style={{ alignSelf: 'stretch', minHeight: minimumTarget }}
            matchContents={{ vertical: true }}
          >
            <Slider
              value={toSlider(q, value)}
              min={range.min}
              max={range.max}
              {...(range.step ? { step: range.step } : {})}
              onValueChange={drag}
              modifiers={[
                accessibilityLabel('Your guess'),
                accessibilityValue(shown),
                accessibilityIdentifier('quiz-slider'),
                disabled(revealed),
              ]}
            />
          </Host>
        ) : (
          <ComposeHost
            style={{ minHeight: minimumTarget }}
            matchContents={{ vertical: true }}
          >
            <ComposeSlider
              value={toSlider(q, value)}
              min={range.min}
              max={range.max}
              steps={
                range.step
                  ? Math.max(
                      0,
                      Math.round((range.max - range.min) / range.step) - 1,
                    )
                  : 0
              }
              enabled={!revealed}
              onValueChange={drag}
              colors={{
                thumbColor: colors.navy,
                activeTrackColor: colors.navy,
                inactiveTrackColor: colors.dividerSubtle,
              }}
              modifiers={[
                semantics({ contentDescription: `Your guess, ${shown}` }),
                composeTestID('quiz-slider'),
              ]}
            />
          </ComposeHost>
        )}
        {tick !== null ? (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.tick, { left: tick - 1 }]}
          />
        ) : null}
      </View>
      <View
        style={[styles.range, stacked ? styles.rangeStacked : null]}
        accessibilityLabel={`From ${low} to ${high}`}
        accessible
      >
        <Text variant="footnote" tone="inkSoft">
          {low}
        </Text>
        <Text variant="footnote" tone="inkSoft">
          {high}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: rhythm.tight },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
  },
  readoutStacked: { flexWrap: 'wrap', alignSelf: 'flex-start' },
  figure: { flexShrink: 1 },
  accessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: rhythm.block,
    paddingVertical: rhythm.line,
    backgroundColor: colors.raised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.dividerSubtle,
  },
  tick: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    width: 2,
    backgroundColor: colors.ink,
  },
  range: { flexDirection: 'row', justifyContent: 'space-between' },
  rangeStacked: { flexDirection: 'column', gap: rhythm.line },
});
