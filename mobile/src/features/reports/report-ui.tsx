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
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
  type ViewProps,
} from 'react-native';
import {
  Group,
  Heading as NativeHeading,
  Text as NativeText,
} from '../../design/primitives';
import {
  colors,
  light,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
} from '../../design/tokens';
import { useHighTextContrast } from '../../design/accessibility';
import {
  dark,
  darkHighContrast,
  lightHighContrast,
} from '../../design/palette';
import { openSource } from '../../navigation/external';
import type { Citation } from './report-model';
import { citationLabel, pageTarget, splitRuns } from './report-model';

// Shared roles resolved for both native platforms, including Android night mode.
export function useReportColors() {
  const scheme = useColorScheme();
  const highContrast = useHighTextContrast();
  return Platform.OS === 'ios'
    ? colors
    : {
        ...(scheme === 'dark' ? dark : light),
        ...(highContrast
          ? scheme === 'dark'
            ? darkHighContrast
            : lightHighContrast
          : {}),
      };
}
export function Text(props: React.ComponentProps<typeof NativeText>) {
  const palette = useReportColors();
  const tone =
    props.tone === 'link'
      ? 'navy'
      : props.tone || textStyles[props.variant || 'body'].color;
  return (
    <NativeText {...props} style={[{ color: palette[tone] }, props.style]} />
  );
}
export function Heading(props: React.ComponentProps<typeof NativeHeading>) {
  const palette = useReportColors();
  return (
    <NativeHeading {...props} style={[{ color: palette.ink }, props.style]} />
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
  const palette = useReportColors();
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
        { backgroundColor: pressed ? palette.sunken : undefined },
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
  const palette = useReportColors();
  return (
    <View
      testID={id}
      style={[styles.panel, { backgroundColor: palette.sunken }]}
    >
      <Pressable
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
  const palette = useReportColors();
  return (
    <Group
      {...props}
      style={[
        {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.dividerSubtle,
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
