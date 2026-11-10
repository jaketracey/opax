import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useState, useSyncExternalStore, type Ref } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { IconButton } from '../../design/controls';
import { formatCount } from '../../design/format';
import { Icon } from '../../design/icon';
import { InlineError } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import {
  colors,
  contentSizeCategory,
  hairline,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
} from '../../design/tokens';
import { chips, defaultOptions } from './model';
import { askSession } from './session';
import { topics } from './topics';

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
/** The share of the visible height the whole composer may take. */
export const COMPOSER_HEIGHT_SHARE = 0.4;
/**
 * The field's maximum height (ask.md 2.11, "AX3 and above, composer"). The
 * text keeps the reader's size at every size (DIRECTION: every role scales
 * to AX5); the field grows to its lines rule (`composerLines`), but never so
 * far that the whole composer, field and its own chrome (padding, the
 * options line, the options and send row), passes 40% of the height the
 * reader can see: the window, less the keyboard while it is up. Past that
 * the field scrolls inside. It never drops below one 44 pt line.
 */
export function composerFieldCap({
  fontScale,
  windowHeight,
  keyboard = 0,
  chrome,
}: {
  fontScale: number;
  windowHeight: number;
  /** How far the keyboard overlaps the screen, 0 when it is down. */
  keyboard?: number;
  /** The composer's height outside the field. */
  chrome: number;
}): number {
  const byLines =
    textStyles.body.lineHeight *
      Math.max(1, fontScale) *
      composerLines(fontScale) +
    20;
  const visible = Math.max(0, windowHeight - keyboard);
  const byHeight = COMPOSER_HEIGHT_SHARE * visible - chrome;
  return Math.max(minimumTarget, Math.min(byLines, byHeight));
}
/**
 * Ask's composer, docked above the tab bar (DIRECTION 4.24). Leading,
 * Options; the field; trailing, one button: Stop while an answer is
 * written, Talk while the field is empty (D5 on), else
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
  talkLabel = composerCopy.talk,
  offline,
  inputError,
  onLayout,
  keyboard = 0,
}: {
  inputRef?: Ref<TextInput>;
  onSend: () => void;
  onStop: () => void;
  onOptions: () => void;
  /** Present when Talk lives in Ask. */
  onTalk?: () => void;
  talkLabel?: string;
  offline: boolean;
  inputError?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
  /** How far the keyboard overlaps the screen; the height cap follows it. */
  keyboard?: number;
}) {
  const s = useSyncExternalStore(
    askSession.subscribe,
    askSession.snapshot,
    askSession.snapshot,
  );
  const { fontScale, height: windowHeight } = useWindowDimensions();
  // The composer's height outside the field, measured: its body less the
  // field. Until both are laid out, the padding and the options line.
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);
  const [fieldHeight, setFieldHeight] = useState<number | null>(null);
  const options = askSession.composerOptions();
  const tags = chips(options, (slug) => topics[slug] ?? slug);
  const empty = !s.draft.trim();
  const line = [
    s.fresh ? composerCopy.fresh : null,
    ...tags.map((tag) => tag.value),
  ]
    .filter(Boolean)
    .join(' · ');
  const chrome =
    bodyHeight !== null && fieldHeight !== null
      ? Math.max(0, bodyHeight - fieldHeight)
      : 2 * rhythm.line + (line ? 28 + rhythm.line : 0);
  const maxHeight = composerFieldCap({
    fontScale,
    windowHeight,
    keyboard,
    chrome,
  });
  const spoken = [
    s.fresh ? composerCopy.fresh : null,
    ...tags.map((tag) => `${tag.key}, ${tag.value}`),
  ]
    .filter(Boolean)
    .join(', ');
  // Options change only between answers, or for an arrival waiting to start
  // its own conversation (AskController.options).
  const locked = s.busy && !s.fresh;
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
      accessibilityLabel={talkLabel}
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
    <View
      style={styles.body}
      onLayout={(e) => setBodyHeight(e.nativeEvent.layout.height)}
    >
      {line ? (
        <View style={styles.optionsLine}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={spoken}
            accessibilityHint="Opens Options"
            accessibilityState={locked ? { disabled: true } : undefined}
            disabled={locked}
            // 28 tall plus 8 above and below: a 44 pt target that stops
            // short of Clear's own slop beside it.
            hitSlop={{ top: 8, bottom: 8 }}
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
            accessibilityState={locked ? { disabled: true } : undefined}
            disabled={locked}
            hitSlop={8}
            onPress={() => {
              if (s.fresh) askSession.clearFresh();
              else askSession.options({ ...defaultOptions });
            }}
            style={styles.clear}
            testID="ask-options-clear"
          >
            <Icon
              name={symbols.clearOptions}
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
          disabled={locked}
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
          onLayout={(e) => setFieldHeight(e.nativeEvent.layout.height)}
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
    ...textStyles.body,
    color: colors.ink,
  },
  counter: { alignSelf: 'flex-end', paddingRight: rhythm.block },
});
