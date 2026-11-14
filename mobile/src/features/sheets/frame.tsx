import { RouteOptions } from '../../navigation/preview';
import type { ReactNode } from 'react';
import { type NativeStackNavigationOptions } from 'expo-router';
import {
  Platform,
  Pressable,
  ScrollView,
  View,
  StyleSheet,
  ToastAndroid,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVerticalBarEdge } from '../../../modules/opax-root-bar';
import { useAccessibilitySize } from '../../design/accessibility';
import { useScreenMargin } from '../../design/adaptive';
import { useKeyCommand } from '../../design/keyboard';
import { SurfaceContext } from '../../design/row-padding';
import { ContentUnavailable } from '../../design/states';
import { Icon } from '../../design/icon';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, rhythm, textStyles } from '../../design/tokens';
import {
  androidHeaderBar,
  closeSheetItem,
  headerItems,
} from '../../navigation/chrome';
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
    ...(Platform.OS === 'android'
      ? {
          presentation: 'formSheet' as const,
          headerShown: false,
          sheetAllowedDetents: accessible ? [1] : [0.5, 1],
          sheetInitialDetentIndex: 0,
          sheetLargestUndimmedDetentIndex: -1,
          sheetGrabberVisible: true,
          sheetCornerRadius: 28,
          sheetElevation: 3,
        }
      : {}),
  };
}
export function SheetFrame({
  title,
  short = false,
  compact = false,
  citation = false,
  testID,
  children,
  options,
}: {
  title: string;
  short?: boolean;
  /** A single rule group needs no extra lower inset above the system safe area. */
  compact?: boolean;
  citation?: boolean;
  testID?: string;
  children: ReactNode;
  options?: NativeStackNavigationOptions;
}) {
  // A sheet that must scroll rather than fit its content: accessibility sizes,
  // and the closed Duo's outer display. There UIKit fits a short sheet to its
  // content as measured at the first layout, before the rail's inset narrows
  // the column, so the text wrapped taller than the sheet and the plain fitted
  // View clipped it with nothing to scroll (glossary terms, b67).
  // Only short (fitted) sheets clip; citation, source and table sheets keep
  // their detents. Read from the live bar edge, so a fold or rotation follows.
  const railed = short && useVerticalBarEdge() !== 'unspecified';
  const accessible = useAccessibilitySize() || railed;
  const margin = useScreenMargin();
  const insets = useSafeAreaInsets();
  const done = closeSheetItem();
  useKeyCommand('list-escape', () => {
    if (done.type === 'button') done.onPress?.();
  });
  const fitted = short && !accessible;
  if (Platform.OS === 'android') {
    const close = () => {
      if (done.type === 'button') done.onPress?.();
    };
    // Native Android form sheets have no toolbar. Put the dialog title and
    // actions inside their content, below the native, draggable grabber.
    const trailing =
      options?.unstable_headerRightItems?.({ canGoBack: false }) ?? [];
    const leading =
      options?.unstable_headerLeftItems?.({ canGoBack: false }) ?? [];
    const heading = (
      <Text
        wordSafe
        variant="sectionTitle"
        accessibilityRole="header"
        style={styles.androidTitle}
      >
        {title}
      </Text>
    );
    const others = trailing.filter(
      (item) => !('label' in item && item.label === 'Done'),
    );
    const leadingBar = androidHeaderBar(leading);
    const trailingBar = androidHeaderBar(others);
    const closeButton = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Done"
        accessibilityHint="Closes this sheet"
        testID="header-done"
        onPress={close}
        onLongPress={() => ToastAndroid.show('Close', ToastAndroid.SHORT)}
        android_ripple={{ color: colors.navyWash, borderless: true }}
        style={styles.androidClose}
      >
        <Icon name={symbols.close} size={24} maxScale={1} />
      </Pressable>
    );
    // At accessibility sizes the title wraps at whole words with the same
    // insets as at the default size. Close stays beside it at the top of the
    // row; a sheet with other actions (citation previous and next) keeps them
    // and Close together on a row of their own below, in reading order.
    const actions = leading.length + others.length > 0;
    return (
      <>
        <RouteOptions
          options={{
            ...routeSheetOptions({ short, citation, accessible }),
            title,
          }}
        />
        <View
          role="dialog"
          accessibilityLabel={title}
          accessibilityViewIsModal
          style={styles.androidDialog}
        >
          {accessible ? (
            <>
              <View
                testID="sheet-heading"
                style={[styles.androidHeading, styles.androidHeadingTop]}
              >
                {heading}
                {actions ? null : closeButton}
              </View>
              {actions ? (
                <View style={styles.androidHeading}>
                  {leadingBar}
                  <View style={{ flex: 1 }} />
                  {trailingBar}
                  {closeButton}
                </View>
              ) : null}
            </>
          ) : (
            <View testID="sheet-heading" style={styles.androidHeading}>
              {leadingBar}
              {heading}
              {trailingBar}
              {closeButton}
            </View>
          )}
          <SurfaceContext.Provider value="sunken">
            <ScrollView
              testID={testID}
              style={styles.androidScroll}
              contentContainerStyle={[
                styles.content,
                {
                  paddingHorizontal: margin,
                  paddingBottom: rhythm.section + insets.bottom,
                },
              ]}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </SurfaceContext.Provider>
        </View>
      </>
    );
  }
  const contentStyle = [
    styles.content,
    {
      paddingHorizontal: margin,
      // A fitted View has no scroll view to apply UIKit's horizontal insets,
      // and UIKit's automatic adjustment is vertical only beside a rail.
      paddingLeft: margin + (fitted || railed ? insets.left : 0),
      paddingRight: margin + (fitted || railed ? insets.right : 0),
      paddingTop: fitted && compact ? rhythm.tight : rhythm.group,
      paddingBottom: fitted
        ? compact && Platform.OS === 'ios'
          ? 0
          : fittedBottom(insets.bottom)
        : rhythm.section + insets.bottom,
    },
  ];
  return (
    <>
      <RouteOptions
        options={{
          ...routeSheetOptions({ short, citation, accessible }),
          title,
          ...options,
        }}
      />
      <SurfaceContext.Provider value="sunken">
        {fitted ? (
          <View
            collapsable={false}
            testID={testID}
            style={[styles.screen, contentStyle]}
          >
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
  androidDialog: { flex: 1, backgroundColor: colors.sunken },
  androidScroll: { flex: 1 },
  androidHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rhythm.tight,
  },
  androidHeadingTop: { alignItems: 'flex-start' },
  androidTitle: {
    flex: 1,
    paddingVertical: rhythm.tight,
    paddingHorizontal: rhythm.tight,
  },
  androidClose: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: { backgroundColor: colors.sunken },
  content: {
    paddingTop: rhythm.group,
    gap: rhythm.group,
  },
});
