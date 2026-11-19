import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useFocusEffect } from 'expo-router';
import {
  BackHandler,
  Platform,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';
import { PlainPressable as Pressable } from '../../design/pressable';
import {
  Group,
  Heading as NativeHeading,
  Text as NativeText,
} from '../../design/primitives';
import { minimumTarget, radii, rhythm, textStyles } from '../../design/tokens';
import { useColors } from '../../design/use-colors';
import { openSource } from '../../navigation/external';
import type { Citation } from './report-model';
import { citationLabel, pageTarget, splitRuns } from './report-model';

// Report text names its colour itself, from the shared roles for the
// appearance on screen (`useColors`: dynamic on iOS, the scheme's hex set on
// Android, High contrast text included).
export function Text(props: React.ComponentProps<typeof NativeText>) {
  const colors = useColors();
  const tone =
    props.tone === 'link'
      ? 'navy'
      : props.tone || textStyles[props.variant || 'body'].color;
  return (
    <NativeText {...props} style={[{ color: colors[tone] }, props.style]} />
  );
}
export function Heading(props: React.ComponentProps<typeof NativeHeading>) {
  const colors = useColors();
  return (
    <NativeHeading {...props} style={[{ color: colors.ink }, props.style]} />
  );
}
export function Link({
  title,
  detail,
  url,
  onPress,
  testID,
  accessibilityLabel,
}: {
  title: string;
  accessibilityLabel?: string;
  detail?: string;
  url?: string;
  onPress?: () => void;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessible
      accessibilityRole={url ? 'link' : 'button'}
      accessibilityLabel={
        accessibilityLabel || [title, detail].filter(Boolean).join(', ')
      }
      accessibilityHint={url ? 'Opens in the in-app browser' : undefined}
      onPress={url ? () => void openSource(url, title) : onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.target,
        { backgroundColor: pressed ? colors.sunken : undefined },
      ]}
    >
      <Text tone="navy">{title}</Text>
      {detail ? <Text variant="secondary">{detail}</Text> : null}
    </Pressable>
  );
}
export function CitationLink({
  cite,
  mainDocument,
  testID,
}: {
  cite: Citation;
  mainDocument?: string;
  testID?: string;
}) {
  return (
    <Link
      title={citationLabel(cite, mainDocument)}
      url={pageTarget(cite)}
      testID={testID}
    />
  );
}

type Disclosures = {
  open: string[];
  toggle: (id: string) => void;
  close: (id: string) => void;
  expand: (id: string) => void;
};
const DisclosureContext = createContext<Disclosures | null>(null);
export function DisclosureProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<string[]>([]);
  const toggle = useCallback(
    (id: string) =>
      setOpen((items) =>
        items.includes(id) ? items.filter((x) => x !== id) : [...items, id],
      ),
    [],
  );
  const expand = useCallback(
    (id: string) =>
      setOpen((items) => (items.includes(id) ? items : [...items, id])),
    [],
  );
  const close = useCallback(
    (id: string) => setOpen((items) => items.filter((x) => x !== id)),
    [],
  );
  // Only the focused screen handles Back. Most recently opened control closes first.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !open.length) return;
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        setOpen((items) => items.slice(0, -1));
        return true;
      });
      return () => back.remove();
    }, [open]),
  );
  const value = useMemo(
    () => ({ open, toggle, close, expand }),
    [open, toggle, close, expand],
  );
  return (
    <DisclosureContext.Provider value={value}>
      {children}
    </DisclosureContext.Provider>
  );
}
export function useDisclosure(id: string) {
  const ctx = useContext(DisclosureContext);
  if (!ctx) throw new Error('Report disclosure requires its provider');
  return {
    open: ctx.open.includes(id),
    toggle: () => ctx.toggle(id),
    close: () => ctx.close(id),
  };
}
export function Disclosure({
  id,
  title,
  detail,
  initiallyOpen = false,
  children,
}: {
  id: string;
  title: string;
  detail?: string;
  initiallyOpen?: boolean;
  children: ReactNode;
}) {
  const state = useDisclosure(id);
  const { expand, close } = useContext(DisclosureContext)!;
  useEffect(() => {
    if (initiallyOpen) expand(id);
    return () => close(id);
  }, [expand, close, id, initiallyOpen]);
  const colors = useColors();
  return (
    <View
      testID={id}
      style={[styles.panel, { backgroundColor: colors.sunken }]}
    >
      <Pressable
        feedback="wash"
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: state.open }}
        onPress={state.toggle}
        testID={`${id}-toggle`}
        style={styles.target}
      >
        <View style={styles.disclosureHead}>
          <Text variant="strong" style={styles.grow}>
            {title}
          </Text>
          <Text
            variant="secondary"
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {state.open ? '−' : '+'}
          </Text>
        </View>
        {detail ? <Text variant="secondary">{detail}</Text> : null}
      </Pressable>
      {state.open ? (
        <Group gap={rhythm.block} style={{ paddingBottom: rhythm.block }}>
          {children}
        </Group>
      ) : null}
    </View>
  );
}
export function Prose({ text, testID }: { text: string; testID?: string }) {
  return (
    <Group
      gap={rhythm.tight}
      accessible
      accessibilityLabel={text}
      testID={testID}
    >
      {splitRuns(text).map((run, index) => (
        <Text
          selectable
          key={index}
          style={
            index
              ? {
                  paddingLeft: /^ [◦▪]/.test(run) ? rhythm.group : rhythm.block,
                }
              : undefined
          }
        >
          {run}
        </Text>
      ))}
    </Group>
  );
}
export function RuleGroup({ style, ...props }: ViewProps & { gap?: number }) {
  const colors = useColors();
  return (
    <Group
      {...props}
      style={[
        {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.dividerSubtle,
          paddingTop: rhythm.block,
        },
        style,
      ]}
    />
  );
}
export const styles = StyleSheet.create({
  target: {
    minHeight: Math.max(48, minimumTarget),
    minWidth: Math.max(48, minimumTarget),
    justifyContent: 'center',
    paddingVertical: rhythm.tight,
    gap: rhythm.line,
    alignSelf: 'stretch',
  },
  panel: {
    borderRadius: radii.tile,
    borderCurve: 'continuous',
    paddingHorizontal: rhythm.block,
    paddingVertical: rhythm.tight,
    minWidth: 0,
  },
  disclosureHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.block,
  },
  grow: { flex: 1, minWidth: 0 },
});
