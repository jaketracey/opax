import { router } from 'expo-router';
import { NavigationRouteContext } from 'expo-router/react-navigation';
import {
  useContext,
  useEffect,
  useId,
  useState,
  type ComponentProps,
} from 'react';
import {
  Platform,
  StyleSheet,
  Text as Run,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
} from 'react-native';
import { explainAction, explainsHint } from '../features/learn/copy';
import { glossaryTerm, type TermId } from '../features/learn/glossary';
import { openTerm } from '../features/learn/open-term';
import { useUnderlineTerms } from '../features/learn/settings';
import { sheetAboveTabs } from '../navigation/sheets';
import { useAccessibilitySize } from './accessibility';
import { Text } from './text';
import { colors } from './tokens';

/**
 * Inline glossary terms (newcomer design README 8.2).
 *
 * A term in running text keeps the text's own colour and weight and takes a
 * dotted underline in soft ink, the FIRST time it appears on a screen and
 * nowhere after: a page that says "Senate" nine times marks one. A tap opens
 * a small popover at the word (the term, one line, "More"); at accessibility
 * sizes the tap opens the answer sheet, because one line at AX5 doesn't fit
 * a bubble. Android has no dotted text decoration, so the line is solid
 * there in the same soft ink.
 *
 * Every answer is the guide's (content/learn/glossary.json). The reader can
 * turn the underline off in Account › Underline terms; then a term is plain
 * text.
 *
 * VoiceOver can't see an underline:
 * - `<Term>` nested in a consumer's `<Text>` is a link run, which VoiceOver
 *   and TalkBack list as their own element;
 * - `<TermText>` is standing text that holds a term: the whole element gets
 *   the hint "Explains division" and activates the answer;
 * - `termA11y(id)` gives a row or tile a custom action, "Explain division",
 *   beside its own (Follow, Share).
 */

// First use, per screen: route key -> term -> the instance that claimed it.
const claims = new Map<string, Map<TermId, string>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** True for the one instance of `term` that marks it on this screen. */
export function useFirstUse(term: TermId | null): boolean {
  const scope = useContext(NavigationRouteContext)?.key ?? 'root';
  const id = useId();
  const [, bump] = useState(0);
  useEffect(() => {
    if (!term) return;
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    const mine = claims.get(scope) ?? new Map<TermId, string>();
    claims.set(scope, mine);
    if (!mine.has(term)) {
      mine.set(term, id);
      notify();
    }
    return () => {
      listeners.delete(listener);
      if (mine.get(term) === id) {
        mine.delete(term);
        if (!mine.size) claims.delete(scope);
        notify();
      }
    };
  }, [term, scope, id]);
  return !!term && claims.get(scope)?.get(term) === id;
}

/** `/term-tip`: the popover at the word (features/learn/TermTip.tsx). */
export const termTipRoute = (
  id: TermId,
  at: { x: number; y: number },
  aboveTabs = false,
) => ({
  pathname: '/term-tip' as const,
  params: {
    id,
    x: String(Math.round(at.x)),
    y: String(Math.round(at.y)),
    ...(aboveTabs ? { over: '1' } : {}),
  },
});

/** A tap on a marked term: the popover, or the sheet at AX sizes. */
export function useTermPress(id: TermId) {
  const large = useAccessibilitySize();
  return (event?: GestureResponderEvent) => {
    const x = event?.nativeEvent?.pageX;
    const y = event?.nativeEvent?.pageY;
    if (large || typeof x !== 'number' || typeof y !== 'number')
      return openTerm(id);
    router.push(termTipRoute(id, { x, y }, sheetAboveTabs()));
  };
}

type TextProps = ComponentProps<typeof Text>;

/**
 * A glossary term inside a `<Text>`: `<Term id="division">divisions</Term>`.
 * Children default to the guide's own word. Plain text when underlines are
 * off or the term is already marked higher on the screen.
 */
export function Term({
  id,
  children,
  testID,
}: {
  id: TermId;
  children?: string;
  testID?: string;
}) {
  const on = useUnderlineTerms();
  const first = useFirstUse(on ? id : null);
  const words = children ?? glossaryTerm(id).word;
  if (!on || !first) return <>{words}</>;
  return (
    <TermRun id={id} testID={testID}>
      {words}
    </TermRun>
  );
}

/** The marked run itself; the caller has already claimed the first use. */
function TermRun({
  id,
  children,
  testID,
}: {
  id: TermId;
  children: string;
  testID?: string;
}) {
  const press = useTermPress(id);
  // A bare run, so it inherits the surrounding text's role, size and colour.
  return (
    <Run
      onPress={press}
      suppressHighlighting={false}
      accessibilityRole="link"
      accessibilityHint={explainsHint(glossaryTerm(id).word)}
      style={styles.term}
      testID={testID ?? `term-inline-${id}`}
    >
      {children}
    </Run>
  );
}

/**
 * Where `term`'s words fall in `text`: `phrase` if given, else the guide's
 * word, matched case-insensitively at a word start and run on to the end of
 * the word, so "division" marks "divisions".
 */
export function findTermWords(
  text: string,
  id: TermId,
  phrase?: string,
): { start: number; end: number } | null {
  const wanted = (phrase ?? glossaryTerm(id).word).toLowerCase();
  const lower = text.toLowerCase();
  let from = 0;
  while (from <= lower.length) {
    const start = lower.indexOf(wanted, from);
    if (start < 0) return null;
    if (!/[\p{L}\p{N}]/u.test(text[start - 1] ?? '')) {
      let end = start + wanted.length;
      while (end < text.length && /[\p{L}]/u.test(text[end]!)) end += 1;
      return { start, end };
    }
    from = start + 1;
  }
  return null;
}

/**
 * One term's words inside text the caller already draws in a `<Text>`:
 * the words before, the marked term, the words after. Plain text when the
 * words aren't there.
 */
export function TermIn({
  text,
  term,
  phrase,
}: {
  text: string;
  term: TermId | null | undefined;
  phrase?: string;
}) {
  const found = term ? findTermWords(text, term, phrase) : null;
  if (!term || !found) return <>{text}</>;
  return (
    <>
      {text.slice(0, found.start)}
      <Term id={term}>{text.slice(found.start, found.end)}</Term>
      {text.slice(found.end)}
    </>
  );
}

/**
 * Standing text that holds one term: "2,929 divisions voted in". VoiceOver
 * reads the whole line with the hint "Explains division"; activating it
 * opens the answer. Without the words in the text it is a plain `Text`.
 */
export function TermText({
  term,
  phrase,
  children,
  testID,
  ...props
}: Omit<TextProps, 'children'> & {
  /** None, or a term not in the words: a plain `Text`. */
  term: TermId | null | undefined;
  phrase?: string;
  children: string;
}) {
  const on = useUnderlineTerms();
  const found = on && term ? findTermWords(children, term, phrase) : null;
  const first = useFirstUse(found && term ? term : null);
  if (!term || !found || !first)
    return (
      <Text {...props} testID={testID}>
        {children}
      </Text>
    );
  const a11y = termA11y(term);
  return (
    <Text
      {...props}
      testID={testID}
      accessibilityHint={explainsHint(glossaryTerm(term).word)}
      accessibilityActions={[
        { name: 'activate' },
        ...a11y.accessibilityActions,
      ]}
      onAccessibilityAction={a11y.onAccessibilityAction}
    >
      {children.slice(0, found.start)}
      <TermRun id={term}>{children.slice(found.start, found.end)}</TermRun>
      {children.slice(found.end)}
    </Text>
  );
}

/**
 * A row's or tile's VoiceOver and TalkBack action for a term in its text:
 * spread into the row, after its own actions. `activate` is handled too, for
 * standing text whose only job is the term.
 */
export function termA11y(id: TermId) {
  const name = termActionName(id);
  return {
    accessibilityActions: [
      { name, label: explainAction(glossaryTerm(id).word) },
    ],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (
        event.nativeEvent.actionName === name ||
        event.nativeEvent.actionName === 'activate'
      )
        openTerm(id);
    },
  };
}

export const termActionName = (id: TermId) => `explain-${id}`;

/**
 * A row's own actions with the term's added: `actions` for its rotor list,
 * and `handle(name)` true when the term's action was the one taken.
 */
export function withTermAction<A extends { name: string; label?: string }>(
  actions: readonly A[] | undefined,
  id: TermId | null | undefined,
) {
  const extra = id ? termA11y(id).accessibilityActions : [];
  return {
    actions: [...(actions ?? []), ...extra],
    handle: (name: string) => {
      if (!id || name !== termActionName(id)) return false;
      openTerm(id);
      return true;
    },
  };
}

/** Tests only. */
export function resetTermClaimsForTests() {
  claims.clear();
  listeners.clear();
}

const styles = StyleSheet.create({
  term: {
    textDecorationLine: 'underline',
    // iOS draws the dots; Android ignores the style and draws a solid line.
    textDecorationStyle: Platform.OS === 'ios' ? 'dotted' : 'solid',
    textDecorationColor: colors.inkFaint,
  },
});
