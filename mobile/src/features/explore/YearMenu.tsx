import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Button as SwiftButton,
  HStack,
  Host,
  Menu,
  Spacer,
} from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  contentShape,
  frame,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import {
  Heading,
  Icon,
  InsetGroup,
  LinkRow,
  Screen,
  TitleAnchor,
  haptic,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { symbols } from '../../design/symbols';
import { exploreYearsRoute } from '../../navigation/routes/explore';

export const FIRST_YEAR = 1998;
export const LAST_YEAR = 2026;
/** 2026 to 1998, newest first, in decades: "2020s", "2010s", "2000s", "1990s". */
export function yearDecades(first = FIRST_YEAR, last = LAST_YEAR) {
  const decades: { label: string; years: number[] }[] = [];
  for (let year = last; year >= first; year--) {
    const label = `${Math.floor(year / 10) * 10}s`;
    const decade = decades.at(-1);
    if (decade?.label === label) decade.years.push(year);
    else decades.push({ label, years: [year] });
  }
  return decades;
}

// The year sheet (VoiceOver, Android) hands its choice back to the page.
const listeners = new Set<(year: number) => void>();
export function chooseYear(year: number) {
  listeners.forEach((listener) => listener(year));
}
export function useYearChoice(onChoose: (year: number) => void) {
  const latest = useRef(onChoose);
  useEffect(() => {
    latest.current = onChoose;
  }, [onChoose]);
  useEffect(() => {
    const listener = (year: number) => latest.current(year);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}

/**
 * The year as the page title and its own menu. The title is React Native
 * text, so it scales and wraps like every page title; on iOS a SwiftUI menu
 * is laid exactly over it as its hit area. VoiceOver and Android activate the
 * title itself, which opens the same choice as a checkmark list sheet.
 */
export function YearMenu({
  year,
  onChange,
}: {
  year: number;
  onChange: (year: number) => void;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const choose = (next: number) => {
    if (next === year) return;
    haptic('selection');
    onChange(next);
  };
  return (
    <View style={styles.wrap}>
      <TitleAnchor>
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Year, ${year}`}
          accessibilityHint="Double-tap to choose another year."
          onPress={() => router.push(exploreYearsRoute(String(year)))}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setSize((old) =>
              old?.width === width && old.height === height
                ? old
                : { width, height },
            );
          }}
          testID="tm-year-menu"
          style={styles.title}
        >
          <Heading level={1} kind="page" testID="tm-selected-year">
            {String(year)}
          </Heading>
          <Icon name={symbols.menu} size={17} tone="inkSoft" maxScale={2} />
        </Pressable>
      </TitleAnchor>
      {Platform.OS === 'ios' && size ? (
        <View
          pointerEvents="box-none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.overlay, size]}
        >
          <Host style={size}>
            <Menu
              modifiers={[accessibilityHidden(true)]}
              label={
                <HStack
                  modifiers={[
                    frame({ width: size.width, height: size.height }),
                    contentShape(shapes.rectangle()),
                  ]}
                >
                  <Spacer />
                </HStack>
              }
            >
              {yearDecades().map((decade) => (
                <Menu key={decade.label} label={decade.label}>
                  {decade.years.map((y) => (
                    <SwiftButton
                      key={y}
                      label={String(y)}
                      systemImage={y === year ? 'checkmark' : undefined}
                      onPress={() => choose(y)}
                    />
                  ))}
                </Menu>
              ))}
            </Menu>
          </Host>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', maxWidth: '100%' },
  title: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  overlay: { position: 'absolute', left: 0, top: 0 },
});

/**
 * The year as a checkmark list, one group per decade: VoiceOver's and
 * Android's way into the year menu (the SwiftUI menu cannot be opened from
 * React Native). Choosing closes the sheet.
 */
export function YearSheet({ year }: { year: number | null }) {
  return (
    <Screen grouped testID="tm-years-sheet">
      {yearDecades().map((decade) => (
        <InsetGroup key={decade.label} header={decade.label}>
          {decade.years.map((y) => (
            <LinkRow
              key={y}
              title={String(y)}
              accessory="checkmark"
              selected={y === year}
              onPress={() => {
                if (y !== year) {
                  haptic('selection');
                  chooseYear(y);
                }
                router.back();
              }}
              testID={`tm-years-${y}`}
            />
          ))}
        </InsetGroup>
      ))}
    </Screen>
  );
}
