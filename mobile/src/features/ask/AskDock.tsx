import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { PlainPressable as Pressable } from '../../design/pressable';
import { IconButton } from '../../design/controls';
import { useAccessibilityFocusRequest } from '../../design/keyboard';
import { formatCount } from '../../design/format';
import { Icon } from '../../design/icon';
import { InlineError } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { chromeTextScaleCap } from '../../design/text-scale';
import {
  contentSizeCategory,
  hairline,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
} from '../../design/tokens';
import { makeStyles, useColors } from '../../design/use-colors';
import { frameOf } from '../money/map/measure';
import { chips, clearChip, defaultOptions } from './model';
import { askSession } from './session';
import { topics } from './topics';

export const composerCopy = {
  placeholder: 'Ask about the public record',
  /** At accessibility sizes, where the full line is cut on one line. */
  placeholderShort: 'Ask about the record',
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
/**
 * The full placeholder's width in ems of its drawn size, with room to
 * spare. Measured: 12.34 em at 17 pt, 12.24 em at 19 pt and 11.8 em at
 * 23 pt in the system font on iOS; 12.84 em in Public Sans on Android.
 */
export const placeholderEms = () => (Platform.OS === 'android' ? 13.5 : 13);
/**
 * The field's width before it can be read: the window less the composer's
 * margins and padding and its two buttons (a 402 pt iPhone's field is
 * 258 pt), less the gap the options chips add and Android's wider 48 dp
 * buttons. Only a stand-in: the field's own width is read before the first
 * frame is painted (AskDock), so the choice never changes after it.
 */
export function composerFieldRoomEstimate(
  windowWidth: number,
  chips: boolean,
): number {
  return (
    windowWidth -
    144 -
    (chips ? rhythm.tight : 0) -
    (Platform.OS === 'android' ? 8 : 0)
  );
}
/**
 * Whether the full placeholder fits the field on its one line. On iOS its
 * type stops growing at the chrome cap (23 pt) while the buttons beside it
 * stay 44 pt, so the full words are cut from xLarge on a narrow phone and
 * from xxLarge on most, not only at the accessibility sizes. Android's
 * hint keeps growing with the reader's size.
 */
export function placeholderFits({
  fontScale,
  room,
}: {
  fontScale: number;
  /** The field's width. */
  room: number;
}): boolean {
  const size =
    textStyles.body.fontSize *
    (Platform.OS === 'android'
      ? fontScale
      : Math.min(fontScale, chromeTextScaleCap));
  return placeholderEms() * size <= room;
}
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
/** The field's padding above and below its text. */
export const COMPOSER_FIELD_PADDING = 11;
/**
 * The field's maximum height (ask.md 2.11, "AX3 and above, composer"). The
 * text keeps the reader's size at every size (DIRECTION: every role scales
 * to AX5); the field grows to its lines rule (`composerLines`), but never so
 * far that the whole composer, field and its own chrome (padding, the
 * options line, the options and send row), passes 40% of the height the
 * reader can see: the window, less the keyboard while it is up. Past that
 * the field scrolls inside. It never drops below one whole line at the
 * reader's size, even where 40% has no room for one.
 *
 * Lines are counted at the size they are drawn: the reader's own text size,
 * below the default as well as above it.
 *
 * The cap is always a whole number of lines, so the field never ends part
 * way through one. A draft that fits is its lines and the padding above and
 * below. One that overflows (`overflowing`) gives up one padding: scrolled
 * to the top it shows the top padding and whole lines, scrolled to the end
 * whole lines and the bottom padding. With both paddings kept, the space
 * of the second showed a slice of the next line (five lines and 9 pt of a
 * sixth at the default size).
 *
 * A draft that fits is never under the touch floor (`composerFieldFloor`).
 * One that overflows is returned as it is, even under the floor: lifted to
 * the floor, a one-line field showed a slice of its second line. The field
 * around it keeps the floor (AskDock).
 *
 * This is the padded field's height. On iOS the text view inside it is the
 * lines alone (`composerTextCap`) and `overflowing` is never given: the
 * padding there does not scroll. Android's text view is the padded field.
 */
export function composerFieldCap({
  fontScale,
  windowHeight,
  keyboard = 0,
  chrome,
  overflowing = false,
}: {
  fontScale: number;
  windowHeight: number;
  /** How far the keyboard overlaps the screen, 0 when it is down. */
  keyboard?: number;
  /** The composer's height outside the field. */
  chrome: number;
  /** The draft has more lines than the cap holds. */
  overflowing?: boolean;
}): number {
  const line = textStyles.body.lineHeight * fontScale;
  const lines = composerFieldLines({
    fontScale,
    windowHeight,
    keyboard,
    chrome,
  });
  return overflowing
    ? lines * line + COMPOSER_FIELD_PADDING
    : Math.max(
        composerFieldFloor(fontScale),
        lines * line + 2 * COMPOSER_FIELD_PADDING,
      );
}
/** How many whole lines the field shows before it scrolls inside. */
function composerFieldLines({
  fontScale,
  windowHeight,
  keyboard = 0,
  chrome,
}: {
  fontScale: number;
  windowHeight: number;
  keyboard?: number;
  chrome: number;
}): number {
  const line = textStyles.body.lineHeight * fontScale;
  const visible = Math.max(0, windowHeight - keyboard);
  const byHeight = COMPOSER_HEIGHT_SHARE * visible - chrome;
  return Math.max(
    1,
    Math.min(
      composerLines(fontScale),
      Math.floor((byHeight - 2 * COMPOSER_FIELD_PADDING) / line),
    ),
  );
}
/**
 * iOS: the most the text view itself may be, the cap's whole lines and
 * nothing else. On iOS the field's padding is the wrapper's, outside what
 * scrolls. Inside the text view it scrolled with the text, and UIKit keeps
 * the caret's line on the view's bottom edge without the padding under it:
 * typing past the cap at AX3 showed three lines under an 11 pt slice of the
 * line above (build 82 sweep). A text view that is whole lines tall, over
 * content that is whole lines, rests on a line's edge wherever the caret
 * puts it. `chrome` is the composer's height outside the padded field.
 */
export function composerTextCap(room: {
  fontScale: number;
  windowHeight: number;
  keyboard?: number;
  chrome: number;
}): number {
  return composerFieldLines(room) * textStyles.body.lineHeight * room.fontScale;
}
/**
 * The least the field's touch area may be: 44 pt, and on Android 48 dp or
 * one line with its paddings, whichever is more.
 */
export function composerFieldFloor(fontScale: number): number {
  return Platform.OS === 'android'
    ? Math.max(
        48,
        textStyles.body.lineHeight * fontScale + 2 * COMPOSER_FIELD_PADDING,
      )
    : minimumTarget;
}
/**
 * Where the caret goes in a draft the reader did not type (an arrival's
 * prefilled question). UIKit keeps the caret in view, and a new value puts
 * it at the end: a draft taller than the field was shown from its last
 * lines, its start scrolled out of sight (on a short window, with the
 * keyboard up, only the last line). So the caret starts at the top, which
 * shows the question from its first word. Once the field reports its
 * content: a draft that fits moves the caret to the end, where typing
 * continues it, and nothing on screen moves; a taller one stays at the top.
 * `done` hands the caret back to the reader: a selection held any longer is
 * re-applied over every tap.
 */
export interface DraftCaret {
  draft: string;
  at: 'start' | 'end';
  /** The field has the selection: the reader's taps are their own again. */
  done: boolean;
  /** The content's height has been judged, once. */
  sized: boolean;
}
export const prefilledCaret = (draft: string): DraftCaret | null =>
  draft ? { draft, at: 'start', done: false, sized: false } : null;
/** The selection to hold for this draft, or none (the reader has the caret). */
export function caretSelection(caret: DraftCaret | null, draft: string) {
  if (!caret || caret.done || caret.draft !== draft) return undefined;
  const at = caret.at === 'start' ? 0 : draft.length;
  return { start: at, end: at };
}
/** The field reported its content's height: a draft that fits edits from its end. */
export function caretAfterContent(
  caret: DraftCaret | null,
  draft: string,
  contentHeight: number,
  fieldCap: number,
): DraftCaret | null {
  if (!caret || caret.draft !== draft || caret.sized) return caret;
  // Judged once: a later size (a rotation, a wider window) moves nothing.
  // Like for like: a text view's content height includes its own vertical
  // padding (measured on iOS 27: three lines report 88 = 3 x 22 + 22, the
  // laid-out height; ten lines report 242 in a field capped at 130). So
  // the cap given is the text view's own: its lines alone on iOS, where it
  // has no padding (composerTextCap), the field's whole height on Android.
  return contentHeight <= fieldCap + 1
    ? { draft, at: 'end', done: false, sized: true }
    : { ...caret, sized: true };
}
/**
 * The field reported a selection.
 *
 * - While a selection is held, the report that matches it means the field
 *   has it: let go. Any other report then is the field's own (a new value
 *   puts the caret at the end first), so it changes nothing.
 * - Once let go, a report somewhere else is the reader's own tap or drag.
 *   Their caret is theirs from then on: the content's height, if it has not
 *   been judged yet, moves nothing (it used to pull the caret of a reader
 *   who tapped in early to the end of the draft).
 */
export function caretAfterSelection(
  caret: DraftCaret | null,
  draft: string,
  selection: { start: number; end: number },
): DraftCaret | null {
  if (!caret || caret.draft !== draft) return caret;
  const held = caretSelection(caret, draft);
  if (held)
    return selection.start === held.start && selection.end === held.end
      ? { ...caret, done: true }
      : caret;
  if (caret.sized) return caret;
  const left = caret.at === 'start' ? 0 : draft.length;
  return selection.start === left && selection.end === left
    ? caret
    : { ...caret, sized: true };
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
  const colors = useColors();
  const styles = useStyles();

  const s = useSyncExternalStore(
    askSession.subscribe,
    askSession.snapshot,
    askSession.snapshot,
  );
  const {
    fontScale,
    height: windowHeight,
    width: windowWidth,
  } = useWindowDimensions();
  // The composer's height outside the field, measured: its body less the
  // field. Until both are laid out, the padding and the options line.
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);
  const [fieldHeight, setFieldHeight] = useState<number | null>(null);
  const options = askSession.composerOptions();
  const tags = chips(options, (slug) => topics[slug] ?? slug);
  const empty = !s.draft.trim();
  // The drawn placeholder is one capped line. Where the full words do not
  // fit the field they ended in an ellipsis ("Ask about the public rec…"),
  // so a shorter line is drawn there. VoiceOver's hint keeps the full words.
  // The field's width is read in a layout effect, so the frame that is
  // first painted already has the final choice; onLayout follows later
  // changes (a rotation, the options chips).
  const fieldRef = useRef<View>(null);
  const [fieldWidth, setFieldWidth] = useState<number | null>(null);
  // Every commit, on purpose: the field's width can change without a
  // dependency changing. It sets state only on a difference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const frame = frameOf(fieldRef);
    if (frame && frame.width > 0 && frame.width !== fieldWidth)
      setFieldWidth(frame.width);
  });
  const shortPlaceholder = !placeholderFits({
    fontScale,
    room: fieldWidth ?? composerFieldRoomEstimate(windowWidth, tags.length > 0),
  });
  // The draft as the reader last typed it. Any other draft is a prefill, as
  // is one already waiting when the composer mounts (prefilledCaret).
  const [typed, setTyped] = useState(s.draft);
  const [caret, setCaret] = useState(() =>
    Platform.OS === 'ios' ? prefilledCaret(s.draft) : null,
  );
  if (s.draft !== typed) {
    setTyped(s.draft);
    setCaret(Platform.OS === 'ios' ? prefilledCaret(s.draft) : null);
  }
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
  // What a draft that fits may take, and what one that overflows is held
  // to: the same whole lines, less one padding (composerFieldCap).
  const [contentHeight, setContentHeight] = useState(0);
  const fitHeight = composerFieldCap({
    fontScale,
    windowHeight,
    keyboard,
    chrome,
  });
  // iOS: the text view is the cap's whole lines, with the padding outside
  // it (composerTextCap); nothing changes when the draft overflows.
  const ios = Platform.OS === 'ios';
  const textCap = composerTextCap({
    fontScale,
    windowHeight,
    keyboard,
    chrome,
  });
  const overflowing = !ios && contentHeight > fitHeight + 1;
  const floor = composerFieldFloor(fontScale);
  const maxHeight = overflowing
    ? composerFieldCap({
        fontScale,
        windowHeight,
        keyboard,
        chrome,
        overflowing,
      })
    : fitHeight;
  // A short window with the keyboard up can hold one line. One line and
  // its top padding is under the touch floor: the text view stays that
  // size, so no slice of the next line shows, and the field keeps the floor.
  const underFloor = overflowing && maxHeight < floor;
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
                  style={({ pressed }) => chipStyle(styles, pressed)}
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
                  style={({ pressed }) => chipStyle(styles, pressed)}
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
            feedback="wash"
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
            feedback="wash"
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
            feedback="wash"
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
        <View
          ref={fieldRef}
          testID="ask-field"
          style={[
            styles.field,
            tags.length > 0 ? styles.fieldInset : null,
            underFloor ? { minHeight: floor } : null,
            ios ? [styles.fieldPadded, { minHeight: floor }] : null,
          ]}
          onLayout={(e) => setFieldWidth(e.nativeEvent.layout.width)}
        >
          <TextInput
            ref={inputRef}
            value={s.draft}
            onChangeText={(text) => {
              setTyped(text);
              askSession.setDraft(text);
            }}
            selection={caretSelection(caret, s.draft)}
            onContentSizeChange={(e) => {
              const { height } = e.nativeEvent.contentSize;
              setContentHeight(height);
              setCaret((old) =>
                caretAfterContent(
                  old,
                  s.draft,
                  height,
                  ios ? textCap : fitHeight,
                ),
              );
            }}
            onSelectionChange={(e) => {
              const { selection } = e.nativeEvent;
              setCaret((old) => caretAfterSelection(old, s.draft, selection));
            }}
            // iOS draws the placeholder below on one capped line; UIKit's
            // multiline placeholder scales without a cap and wraps, so at
            // AX3 the empty composer took three lines (sweep 1, 2.1).
            // Android keeps its native hint and its own field height.
            placeholder={
              drawn
                ? undefined
                : shortPlaceholder
                  ? composerCopy.placeholderShort
                  : composerCopy.placeholder
            }
            placeholderTextColor={drawn ? undefined : colors.inkSoft}
            // The full words, wherever the drawn or native line is the
            // short one.
            accessibilityHint={
              drawn || (Platform.OS === 'android' && shortPlaceholder)
                ? composerCopy.placeholder
                : undefined
            }
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
            // Under the floor the text view is its whole lines only; the
            // field around it keeps the floor, and a tap in the rest of
            // it still lands here.
            hitSlop={
              ios
                ? { top: COMPOSER_FIELD_PADDING, bottom: floor }
                : underFloor
                  ? { bottom: floor - maxHeight }
                  : undefined
            }
            style={[
              styles.input,
              ios ? styles.inputBare : styles.inputPadded,
              { maxHeight: ios ? textCap : maxHeight },
              Platform.OS === 'android'
                ? { minHeight: floor, textAlignVertical: 'top' }
                : null,
              underFloor ? { minHeight: maxHeight } : null,
            ]}
            onLayout={(e) =>
              setFieldHeight(
                ios
                  ? // The padded field: the text view and the padding
                    // around it, never under the touch floor.
                    Math.max(
                      floor,
                      e.nativeEvent.layout.height + 2 * COMPOSER_FIELD_PADDING,
                    )
                  : Math.max(
                      e.nativeEvent.layout.height,
                      underFloor ? floor : 0,
                    ),
              )
            }
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
                {shortPlaceholder
                  ? composerCopy.placeholderShort
                  : composerCopy.placeholder}
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
  // No shadow reads on the dark ground, and Android's navy-tinted one
  // would be a pale smudge there: the raised step and its outline carry it.
  const dark = useColorScheme() === 'dark';
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
            Platform.OS === 'android' && !dark ? styles.androidSurface : null,
          ]}
        >
          {content}
        </View>
      )}
    </View>
  );
}
/**
 * A chip is filled with the sunken wash already, so the shared pressed wash
 * showed nothing on it: pressed, it takes the next step down (iOS; Android
 * has its ripple in the same colour).
 */
const chipStyle = (styles: ReturnType<typeof useStyles>, pressed: boolean) => [
  styles.chip,
  pressed && Platform.OS === 'ios' ? styles.chipPressed : null,
];
const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    chipPressed: { backgroundColor: colors.dividerSubtle },
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
      // Clear in light. In dark it draws over the border: the hairline that
      // stands in for elevation, as on the shared cards.
      outlineWidth: hairline,
      outlineOffset: -hairline,
      outlineStyle: 'solid',
      outlineColor: colors.raisedOutline,
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
    // With options on, the Options button is a filled disc as wide as its
    // target, and the draft's first letters touched it. Unselected, the glyph
    // sits inside its target and leaves its own gap.
    fieldInset: { marginLeft: rhythm.tight },
    placeholder: {
      position: 'absolute',
      top: 11,
      left: 0,
      right: 0,
    },
    // The field wrapper takes the row's width; the input grows with its lines
    // (flex here would be vertical, holding typed lines at the minimum).
    input: {
      paddingHorizontal: 0,
      ...textStyles.body,
      color: colors.ink,
    },
    // Android: the padding is the text view's own, and scrolls with the text.
    inputPadded: {
      minHeight: minimumTarget,
      paddingTop: COMPOSER_FIELD_PADDING,
      paddingBottom: COMPOSER_FIELD_PADDING,
    },
    // iOS: whole lines only; the padding is the field's (fieldPadded), so it
    // never scrolls and no caret position leaves part of a line showing.
    inputBare: { paddingTop: 0, paddingBottom: 0 },
    fieldPadded: { paddingVertical: COMPOSER_FIELD_PADDING },
    counter: { alignSelf: 'flex-end', paddingRight: rhythm.block },
  }),
);
