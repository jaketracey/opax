import { useSyncExternalStore, type Ref } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { IconButton } from '../../design/controls';
import { Icon } from '../../design/icon';
import { InlineError } from '../../design/states';
import { Text } from '../../design/text';
import {
  colors,
  contentSizeCategory,
  fonts,
  hairline,
  minimumTarget,
  radii,
  rhythm,
} from '../../design/tokens';
import { formatCount } from '../../design/format';
import { chips, defaultOptions } from './model';
import { askSession } from './session';
import { topics } from './Options';

export const composerCopy = {
  placeholder: 'Ask about the public record',
  label: 'Question',
  send: 'Send',
  stop: 'Stop answering',
  talk: 'Talk to OPAX',
  options: 'Options',
  clear: 'Clear options',
  fresh: 'Starts a new conversation',
} as const;
const MAX = 2000;
/** Lines before the field scrolls inside (journeys/ask.md 4.4a). */
export function composerLines(fontScale: number) {
  const category = contentSizeCategory(fontScale);
  return category === 'ax4' || category === 'ax5'
    ? 2
    : category.startsWith('ax')
      ? 3
      : 5;
}
/**
 * Ask's composer, docked above the tab bar (DIRECTION 4.24). Leading,
 * Options; the field; trailing, one button: Stop while an answer is
 * written, Talk while the field is empty (signed-in readers, D5 on), else
 * Send. The options in force show as one line inside it, above the field;
 * an arrival's draft that waits for a running answer says it starts a new
 * conversation.
 */
export function AskDock({
  inputRef,
  onSend,
  onStop,
  onOptions,
  onTalk,
  offline,
  inputError,
  onLayout,
}: {
  inputRef?: Ref<TextInput>;
  onSend: () => void;
  onStop: () => void;
  onOptions: () => void;
  /** Present for signed-in readers when Talk lives in Ask. */
  onTalk?: () => void;
  offline: boolean;
  inputError?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const s = useSyncExternalStore(
    askSession.subscribe,
    askSession.snapshot,
    askSession.snapshot,
  );
  const { fontScale } = useWindowDimensions();
  const options = askSession.composerOptions();
  const tags = chips(options, (slug) => topics[slug] ?? slug);
  const empty = !s.draft.trim();
  const lines = composerLines(fontScale);
  const maxHeight = 23 * Math.max(1, fontScale) * lines + 20;
  const line = [
    s.fresh ? composerCopy.fresh : null,
    ...tags.map((tag) => tag.value),
  ]
    .filter(Boolean)
    .join(' · ');
  const spoken = [
    s.fresh ? composerCopy.fresh : null,
    ...tags.map((tag) => `${tag.key}, ${tag.value}`),
  ]
    .filter(Boolean)
    .join(', ');
  const trailing = s.busy ? (
    <IconButton
      symbol="stop.circle.fill"
      variant="primary"
      accessibilityLabel={composerCopy.stop}
      onPress={onStop}
      testID="ask-stop"
    />
  ) : empty && onTalk ? (
    <IconButton
      symbol="waveform"
      accessibilityLabel={composerCopy.talk}
      onPress={onTalk}
      testID="ask-talk"
    />
  ) : (
    <IconButton
      symbol="arrow.up.circle.fill"
      variant="primary"
      accessibilityLabel={composerCopy.send}
      disabled={empty || offline}
      onPress={onSend}
      testID="ask-submit"
    />
  );
  const content = (
    <View style={styles.body}>
      {line ? (
        <View style={styles.optionsLine}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={spoken}
            accessibilityHint="Opens Options"
            onPress={onOptions}
            style={styles.optionsText}
            testID={s.fresh ? 'ask-draft-new-conversation' : 'ask-options-line'}
          >
            <Text variant="footnote" tone="inkSoft" numberOfLines={1}>
              {line}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={composerCopy.clear}
            hitSlop={8}
            onPress={() => {
              if (s.fresh) askSession.clearFresh();
              else askSession.options({ ...defaultOptions });
            }}
            style={styles.clear}
            testID="ask-options-clear"
          >
            <Icon
              name="xmark.circle"
              size={17}
              tone="inkFaint"
              maxScale={1.5}
            />
          </Pressable>
        </View>
      ) : null}
      {inputError ? (
        <InlineError
          subject="question"
          message={inputError}
          testID="ask-input-error"
        />
      ) : null}
      <View style={styles.row}>
        <IconButton
          symbol="slider.horizontal.3"
          selected={tags.length > 0}
          accessibilityLabel={
            tags.length
              ? `${composerCopy.options}, ${tags.length} on`
              : composerCopy.options
          }
          onPress={onOptions}
          testID="ask-composer-options"
        />
        <TextInput
          ref={inputRef}
          value={s.draft}
          onChangeText={(text) => askSession.setDraft(text)}
          placeholder={composerCopy.placeholder}
          placeholderTextColor={colors.inkSoft}
          accessibilityLabel={composerCopy.label}
          multiline
          scrollEnabled
          maxLength={MAX}
          returnKeyType="send"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => {
            if (!s.busy && !empty && !offline) onSend();
          }}
          allowFontScaling
          style={[styles.input, { maxHeight }]}
          testID="ask-question"
        />
        {trailing}
      </View>
      {s.draft.length > 1800 ? (
        <Text variant="footnote" tone="inkSoft" style={styles.counter}>
          {`${formatCount(s.draft.length)} of ${formatCount(MAX)}`}
        </Text>
      ) : null}
    </View>
  );
  const glass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  return (
    <View onLayout={onLayout} testID="ask-dock">
      {glass ? (
        <GlassView
          style={styles.glass}
          glassEffectStyle="regular"
          isInteractive
        >
          {content}
        </GlassView>
      ) : (
        <View style={styles.fallback}>{content}</View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  body: {
    gap: rhythm.line,
    paddingHorizontal: rhythm.line,
    paddingVertical: rhythm.line,
  },
  glass: {
    borderRadius: radii.container,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: colors.raised,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
  },
  optionsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    paddingLeft: rhythm.block - rhythm.line,
    paddingRight: rhythm.line,
    paddingTop: rhythm.line,
  },
  optionsText: { flex: 1, minHeight: 28, justifyContent: 'center' },
  clear: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  input: {
    flex: 1,
    minHeight: minimumTarget,
    paddingTop: 11,
    paddingBottom: 11,
    paddingHorizontal: 0,
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink,
  },
  counter: { alignSelf: 'flex-end', paddingRight: rhythm.block },
});
