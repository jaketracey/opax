import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useState, useSyncExternalStore, type Ref } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { IconButton } from '../../design/controls';
import { useAccessibilityFocusRequest } from '../../design/keyboard';
import { formatCount } from '../../design/format';
import { Icon } from '../../design/icon';
import { InlineError } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { chromeTextScaleCap } from '../../design/text-scale';
import {
  colors,
  contentSizeCategory,
  hairline,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
} from '../../design/tokens';
import { chips, clearChip, defaultOptions } from './model';
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
  queued: 'Asks when this answer finishes',
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
 * conversation, or, for a tapped question, that it asks when the answer
 * finishes.
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
  // iOS: an empty composer is one capped line, its symbols scaling with it.
  const drawn = empty && Platform.OS === 'ios';
  const symbolScale = Platform.OS === 'ios' ? chromeTextScaleCap : 1;
  // A tapped question waiting for the running answer says when it goes.
  const freshLabel = s.queued ? composerCopy.queued : composerCopy.fresh;
  // A tapped question that waits puts VoiceOver on this line (`askNow`).
  const waitingLine = useAccessibilityFocusRequest('ask-waiting');
  const line = [s.fresh ? freshLabel : null, ...tags.map((tag) => tag.value)]
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
    s.fresh ? freshLabel : null,
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
      maxScale={symbolScale}
      variant="primary"
      accessibilityLabel={composerCopy.stop}
      onPress={onStop}
      testID="ask-stop"
    />
  ) : empty && onTalk ? (
    <IconButton
      symbol="waveform"
      maxScale={symbolScale}
      accessibilityLabel={talkLabel}
      onPress={onTalk}
      testID="ask-talk"
    />
  ) : (
    <IconButton
      symbol="arrow.up.circle.fill"
      maxScale={symbolScale}
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
      {Platform.OS === 'android' && line ? (
        <View style={styles.androidOptions}>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            style={styles.optionScroller}
            testID={s.fresh ? 'ask-draft-new-conversation' : 'ask-options-line'}
          >
            <View style={styles.chips}>
              {s.fresh ? (
                <Pressable
                  ref={waitingLine}
                  accessibilityRole="button"
                  accessibilityLabel={freshLabel}
                  accessibilityHint="Opens Options"
                  onPress={onOptions}
                  android_ripple={{ color: colors.dividerSubtle }}
                  style={styles.chip}
                >
                  <Text variant="footnote" tone="inkSoft">
                    {freshLabel}
                  </Text>
                </Pressable>
              ) : null}
              {tags.map((tag) => (
                <Pressable
                  key={tag.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${tag.key}, ${tag.value}`}
                  disabled={s.busy && !s.fresh}
                  accessibilityState={{ disabled: s.busy && !s.fresh }}
                  onPress={() => askSession.options(clearChip(options, tag.id))}
                  android_ripple={{ color: colors.dividerSubtle }}
                  style={styles.chip}
                  testID={`ask-option-remove-${tag.id}`}
                >
                  <Text variant="footnote">{tag.value}</Text>
                  <Icon
                    name={symbols.close}
                    size={18}
                    tone="inkSoft"
                    maxScale={1}
                  />
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={composerCopy.clear}
            disabled={s.busy && !s.fresh}
            accessibilityState={{ disabled: s.busy && !s.fresh }}
            onPress={() => {
              if (s.fresh) askSession.clearFresh();
              else askSession.options({ ...defaultOptions });
            }}
            android_ripple={{ color: colors.dividerSubtle }}
            style={styles.androidClear}
            testID="ask-options-clear"
          >
            <Icon
              name={symbols.clearOptions}
              size={20}
              tone="inkSoft"
              maxScale={1}
            />
          </Pressable>
        </View>
      ) : line ? (
        <View style={styles.optionsLine}>
          <Pressable
            ref={s.fresh ? waitingLine : undefined}
            accessibilityRole="button"
            accessibilityLabel={spoken}
            accessibilityHint="Opens Options"
            accessibilityState={locked ? { disabled: true } : undefined}
            disabled={locked}
            // 28 tall plus 8 above and below: a 44 pt target (10 for 48 dp
            // on Android) that stops short of Clear's own slop beside it.
            hitSlop={
              Platform.OS === 'android'
                ? { top: 10, bottom: 10 }
                : { top: 8, bottom: 8 }
            }
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
            // 28 plus 8 on each side is 44 pt; Android's minimum is 48 dp.
            hitSlop={Platform.OS === 'android' ? 10 : 8}
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
      <View style={[styles.row, drawn ? styles.rowEmpty : null]}>
        <IconButton
          symbol="slider.horizontal.3"
          maxScale={symbolScale}
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
        <View style={styles.field}>
          <TextInput
            ref={inputRef}
            value={s.draft}
            onChangeText={(text) => askSession.setDraft(text)}
            // iOS draws the placeholder below on one capped line; UIKit's
            // multiline placeholder scales without a cap and wraps, so at
            // AX3 the empty composer took three lines (sweep 1, 2.1).
            // Android keeps its native hint and its own field height.
            placeholder={drawn ? undefined : composerCopy.placeholder}
            placeholderTextColor={drawn ? undefined : colors.inkSoft}
            accessibilityHint={drawn ? composerCopy.placeholder : undefined}
            // Empty, the field sizes its one line to the placeholder; typed
            // text keeps the reader's full size.
            maxFontSizeMultiplier={drawn ? chromeTextScaleCap : undefined}
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
            style={[
              styles.input,
              { maxHeight },
              Platform.OS === 'android'
                ? {
                    minHeight: Math.max(
                      48,
                      textStyles.body.lineHeight * fontScale + 22,
                    ),
                    maxHeight: Math.max(
                      maxHeight,
                      textStyles.body.lineHeight * fontScale + 22,
                    ),
                    textAlignVertical: 'top',
                  }
                : null,
            ]}
            onLayout={(e) => setFieldHeight(e.nativeEvent.layout.height)}
            testID="ask-question"
          />
          {drawn ? (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.placeholder}
            >
              <Text
                tone="inkSoft"
                numberOfLines={1}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={chromeTextScaleCap}
                testID="ask-placeholder"
              >
                {composerCopy.placeholder}
              </Text>
            </View>
          ) : null}
        </View>
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
        <View
          style={[
            styles.fallback,
            Platform.OS === 'android' ? styles.androidSurface : null,
          ]}
        >
          {content}
        </View>
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
  androidSurface: { elevation: 2, shadowColor: colors.navy },
  androidOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    paddingHorizontal: rhythm.tight,
  },
  optionScroller: { flex: 1, minWidth: 0 },
  androidClear: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  chips: { flexDirection: 'row', gap: rhythm.tight },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: 48,
    paddingHorizontal: rhythm.tight,
    paddingVertical: rhythm.line,
    borderRadius: 8,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.sunken,
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
  // One line, empty: the symbols centre on the placeholder's line.
  rowEmpty: { alignItems: 'center' },
  field: { flex: 1 },
  placeholder: {
    position: 'absolute',
    top: 11,
    left: 0,
    right: 0,
  },
  // The field wrapper takes the row's width; the input grows with its lines
  // (flex here would be vertical, holding typed lines at the minimum).
  input: {
    minHeight: minimumTarget,
    paddingTop: 11,
    paddingBottom: 11,
    paddingHorizontal: 0,
    ...textStyles.body,
    color: colors.ink,
  },
  counter: { alignSelf: 'flex-end', paddingRight: rhythm.block },
});
