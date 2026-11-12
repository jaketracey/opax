import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRead } from '../../api/useRead';
import {
  useAccessibilitySize,
  useIncreaseContrast,
  useReduceMotion,
} from '../../design/accessibility';
import { useKeyCommand } from '../../design/keyboard';
import { Text } from '../../design/text';
import { colors, radii, rhythm } from '../../design/tokens';
import { androidHeaderBar } from '../../navigation/chrome';
import { openSource } from '../../navigation/external';
import { RouteOptions } from '../../navigation/preview';
import { AndroidPhoto } from './AndroidPhoto';
import { PHOTO_BLACK } from './Picture';
import { openPhotoSource, photoIndex, pictureKey } from './YearGallery';
import { explore } from './runtime';

const close = () => router.back();

/** A native full-screen window covers the tabs and receives Android Back. */
export default function PhotoViewer() {
  const params = useLocalSearchParams<{ year?: string; photo?: string }>();
  const year = /^\d{4}$/.test(params.year ?? '') ? params.year! : '';
  const read = useRead(explore.pictures);
  const photos = useMemo(
    () => read.record?.data[year] ?? [],
    [read.record, year],
  );
  const [page, setPage] = useState<number | null>(null);
  const shown = page ?? photoIndex(photos, params.photo);
  const current = photos[shown];
  const [chrome, setChrome] = useState(true);
  const [focused, setFocused] = useState(true);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const contrast = useIncreaseContrast();
  const large = useAccessibilitySize();
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useKeyCommand('list-escape', close);
  const turn = (direction: number) =>
    setPage(Math.max(0, Math.min(photos.length - 1, shown + direction)));
  return (
    <Modal
      visible={focused}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <RouteOptions options={{ headerShown: false }} />
      <GestureHandlerRootView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View
          testID="photo-viewer"
          style={styles.screen}
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          onLayout={({ nativeEvent: { layout } }) =>
            setSize({ width: layout.width, height: layout.height })
          }
        >
          {chrome ? (
            <View
              style={[styles.bar, { paddingTop: insets.top }]}
              testID="photo-viewer-toolbar"
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                onPress={close}
                android_ripple={{ color: colors.onBand }}
                style={styles.action}
                testID="photo-viewer-done"
              >
                <Text variant="body" style={styles.light}>
                  Done
                </Text>
              </Pressable>
              <Text
                wordSafe
                variant="secondary"
                accessibilityRole="header"
                style={[styles.light, styles.title]}
              >
                {current
                  ? large
                    ? `${shown + 1}/${photos.length}`
                    : `${shown + 1} of ${photos.length}`
                  : ''}
              </Text>
              {current ? (
                <View style={styles.more}>
                  {androidHeaderBar([
                    {
                      type: 'menu',
                      label: 'More',
                      accessibilityLabel: 'More for this photograph',
                      menu: {
                        title: 'Photograph',
                        items: [
                          {
                            type: 'action',
                            label: 'Open original',
                            onPress: () =>
                              void openSource(
                                current.source_url,
                                'Wikimedia Commons',
                              ),
                          },
                        ],
                      },
                    },
                  ])}
                </View>
              ) : null}
            </View>
          ) : null}
          {current && size.width > 0 && size.height > 0 ? (
            <AndroidPhoto
              key={`${pictureKey(current)}/${size.width}/${size.height}`}
              photo={current}
              {...size}
              reduced={reduced}
              onPage={turn}
              onClose={close}
              onToggleChrome={() => setChrome((value) => !value)}
            />
          ) : null}
          {current && chrome ? (
            <View
              style={[
                styles.panel,
                {
                  backgroundColor: contrast
                    ? colors.photoScrimStrong
                    : colors.photoScrim,
                },
              ]}
              testID="photo-viewer-caption"
            >
              <ScrollView
                contentContainerStyle={[
                  styles.panelContent,
                  { paddingBottom: insets.bottom + rhythm.block },
                ]}
              >
                <Text wordSafe variant="body" style={styles.light}>
                  {current.caption}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Photo: ${current.author}, ${current.licence}.`}
                  accessibilityHint="Double-tap for the source and licence."
                  onPress={() => {
                    setFocused(false);
                    openPhotoSource(current, 'photo-viewer-source');
                  }}
                  style={styles.credit}
                  testID={`photo-viewer-credit-${pictureKey(current)}`}
                >
                  <Text
                    wordSafe
                    variant="footnote"
                    style={styles.light}
                  >{`Photo: ${current.author} · ${current.licence}`}</Text>
                </Pressable>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PHOTO_BLACK },
  bar: {
    position: 'absolute',
    zIndex: 1,
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.photoScrim,
  },
  action: {
    minWidth: 64,
    minHeight: 48,
    paddingHorizontal: rhythm.block,
    justifyContent: 'center',
  },
  light: { color: colors.onBand },
  more: {
    backgroundColor: colors.paper,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    margin: rhythm.tight,
  },
  title: { flex: 1, flexShrink: 1, textAlign: 'center' },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '40%',
  },
  panelContent: {
    gap: rhythm.line,
    paddingHorizontal: rhythm.screen,
    paddingTop: rhythm.block,
  },
  credit: { minHeight: 48, justifyContent: 'center' },
});
