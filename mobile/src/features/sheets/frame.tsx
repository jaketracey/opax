import type { ReactNode } from 'react';
import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import { Platform, ScrollView, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccessibilitySize } from '../../design/accessibility';
import { useScreenMargin } from '../../design/adaptive';
import { useKeyCommand } from '../../design/keyboard';
import { SurfaceContext } from '../../design/row-padding';
import { ContentUnavailable } from '../../design/states';
import { colors, rhythm, textStyles } from '../../design/tokens';
import { closeSheetItem, headerItems } from '../../navigation/chrome';
import { sheetOptions } from '../../navigation/stack/screen';

export function routeSheetOptions({
  short = false,
  table = false,
  citation = false,
  accessible = false,
}: {
  short?: boolean;
  table?: boolean;
  citation?: boolean;
  accessible?: boolean;
} = {}): NativeStackNavigationOptions {
  return {
    ...sheetOptions,
    headerTitleStyle: textStyles.inlineTitle,
    headerTintColor: colors.navy,
    contentStyle: { backgroundColor: colors.sunken },
    sheetAllowedDetents:
      short && !table ? (accessible ? [1] : 'fitToContents') : [0.5, 1],
    sheetInitialDetentIndex: accessible && (!short || table) ? 1 : 0,
    sheetExpandsWhenScrolledToEdge: true,
    ...(citation ? { sheetLargestUndimmedDetentIndex: 0 } : {}),
    ...headerItems(() => [closeSheetItem()]),
  };
}
export function SheetFrame({
  title,
  short = false,
  citation = false,
  testID,
  children,
  options,
}: {
  title: string;
  short?: boolean;
  citation?: boolean;
  testID?: string;
  children: ReactNode;
  options?: NativeStackNavigationOptions;
}) {
  const accessible = useAccessibilitySize();
  const margin = useScreenMargin();
  const insets = useSafeAreaInsets();
  const done = closeSheetItem();
  useKeyCommand('list-escape', () => {
    if (done.type === 'button') done.onPress?.();
  });
  const fitted = short && !accessible;
  const contentStyle = [
    styles.content,
    {
      paddingHorizontal: margin,
      paddingBottom: fitted
        ? fittedBottom(insets.bottom)
        : rhythm.section + insets.bottom,
    },
  ];
  return (
    <>
      <Stack.Screen
        options={{
          ...routeSheetOptions({ short, citation, accessible }),
          title,
          ...options,
        }}
      />
      <SurfaceContext.Provider value="sunken">
        {fitted ? (
          <View testID={testID} style={[styles.screen, contentStyle]}>
            {children}
          </View>
        ) : (
          <ScrollView
            testID={testID}
            style={styles.screen}
            contentContainerStyle={contentStyle}
            contentInsetAdjustmentBehavior="automatic"
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        )}
      </SurfaceContext.Provider>
    </>
  );
}
/**
 * A `fitToContents` sheet on iOS is sized to its content plus the bar, and
 * with the opaque sheet bar (`headerTransparent: false`) its content is
 * laid out below the bar. The content needs no offset of its own: a
 * relative `top` by the bar's height (an earlier fix) left a bar-high empty
 * band above the note and pushed its end out of the sheet
 * (w4-edition-machine-note).
 *
 * The iOS sheet already adds room for the home indicator under fitted
 * content, so the content keeps only a group gap of its own there.
 */
export function fittedBottom(bottomInset: number): number {
  return Platform.OS === 'ios' ? rhythm.group : rhythm.section + bottomInset;
}
export function MissingPayload() {
  return (
    <ContentUnavailable
      symbol="doc.text.magnifyingglass"
      title="Nothing to show"
    />
  );
}
const styles = StyleSheet.create({
  screen: { backgroundColor: colors.sunken },
  content: {
    paddingTop: rhythm.group,
    gap: rhythm.group,
  },
});
