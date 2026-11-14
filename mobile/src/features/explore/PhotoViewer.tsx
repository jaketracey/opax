import { RouteOptions } from '../../navigation/preview';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { NativeStackHeaderItem } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Text as NativeText,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRead } from '../../api/useRead';
import {
  useAccessibilitySize,
  useIncreaseContrast,
  useReduceMotion,
} from '../../design/accessibility';
import { useKeyCommand } from '../../design/keyboard';
import { Text, copy } from '../../design/primitives';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { openOnOpaxItem } from '../../navigation/chrome';
import { exploreWebPath } from '../../navigation/routes/explore';
import { openSource } from '../../navigation/external';
import { PHOTO_BLACK, Picture } from './Picture';
import { openPhotoSource, photoIndex, pictureKey } from './YearGallery';
import type { YearPicture } from './pictures';
import { explore } from './runtime';

const close = () => router.back();
/** "2 of 6"; "2/6" at accessibility sizes, before it would wrap. */
export const pageTitle = (page: number, count: number, large = false) =>
  large ? `${page + 1}/${count}` : `${page + 1} of ${count}`;

function ZoomPage({
  photo,
  width,
  height,
  onZoom,
  onToggleChrome,
}: {
  photo: YearPicture;
  width: number;
  height: number;
  onZoom: (zoomed: boolean) => void;
  onToggleChrome: () => void;
}) {
  const zoom = useRef<ScrollView>(null);
  const zoomed = useRef(false);
  const lastTap = useRef(0);
  const single = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (single.current) clearTimeout(single.current);
    },
    [],
  );
  const ratio = photo.width / photo.height;
  const fit =
    width / height > ratio
      ? { width: height * ratio, height }
      : { width, height: width / ratio };
  const zoomTo = (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) =>
    (
      zoom.current as unknown as {
        scrollResponderZoomTo?: (
          r: typeof rect & { animated?: boolean },
        ) => void;
      } | null
    )?.scrollResponderZoomTo?.({ ...rect, animated: true });
  return (
    <ScrollView
      ref={zoom}
      style={{ width, height }}
      contentContainerStyle={styles.zoomContent}
      maximumZoomScale={3}
      minimumZoomScale={1}
      centerContent
      bouncesZoom
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(event) => {
        const now = (event.nativeEvent.zoomScale ?? 1) > 1.01;
        if (now !== zoomed.current) {
          zoomed.current = now;
          onZoom(now);
        }
      }}
    >
      <Pressable
        accessible
        accessibilityRole="image"
        accessibilityLabel={photo.caption}
        onPress={(event) => {
          const time = Date.now();
          if (time - lastTap.current < 280) {
            if (single.current) clearTimeout(single.current);
            lastTap.current = 0;
            const { locationX, locationY } = event.nativeEvent;
            zoomTo(
              zoomed.current
                ? { x: 0, y: 0, width, height }
                : {
                    x: locationX - width / 6,
                    y: locationY - height / 6,
                    width: width / 3,
                    height: height / 3,
                  },
            );
            return;
          }
          lastTap.current = time;
          single.current = setTimeout(onToggleChrome, 280);
        }}
        style={{
          width,
          height,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View style={fit}>
          <Picture
            failure="inline"
            file={photo.file}
            ratio={ratio}
            ground="black"
            rounded={false}
          />
        </View>
      </Pressable>
    </ScrollView>
  );
}

/**
 * A year's photographs full screen, on black, as in Photos: page through
 * them, pinch or double-tap to zoom, swipe down to close. The caption and
 * credit sit on a dark band that never takes more than 40% of the height.
 */
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
  const { width, height } = useWindowDimensions();
  const reduced = useReduceMotion();
  const contrast = useIncreaseContrast();
  const large = useAccessibilitySize();
  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const pager = useRef<ScrollView>(null);
  const placed = useRef(false);
  const [drag] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (placed.current || !photos.length) return;
    placed.current = true;
    pager.current?.scrollTo({ x: shown * width, animated: false });
  }, [photos.length, shown, width]);
  useKeyCommand('list-escape', close);
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, g) =>
          !reduced &&
          !zoomed &&
          g.dy > 12 &&
          Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderMove: (_event, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_event, g) => {
          if (g.dy > height / 3 || g.vy > 1.2) close();
          else
            Animated.spring(drag, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [reduced, zoomed, drag, height],
  );
  const doneItem: NativeStackHeaderItem = {
    type: 'button',
    label: 'Done',
    variant: 'plain',
    tintColor: colors.onBand,
    accessibilityLabel: 'Done',
    onPress: close,
  };
  const menuItem: NativeStackHeaderItem | null = current
    ? {
        type: 'menu',
        label: 'More',
        accessibilityLabel: 'More for this photograph',
        icon: { type: 'sfSymbol', name: 'ellipsis.circle' },
        tintColor: colors.onBand,
        menu: {
          items: [
            {
              type: 'action',
              label: 'Open original',
              onPress: () =>
                void openSource(current.source_url, 'Wikimedia Commons'),
            },
            openOnOpaxItem(exploreWebPath('tm', { year }), 'Time machine'),
          ],
        },
      }
    : null;
  const band = contrast ? colors.photoScrimStrong : colors.photoScrim;
  const glass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  return (
    <View
      testID="photo-viewer"
      style={styles.screen}
      accessibilityViewIsModal
      onAccessibilityEscape={close}
    >
      <RouteOptions
        options={{
          headerShown: chrome,
          title: current ? pageTitle(shown, photos.length, large) : '',
          headerTransparent: true,
          headerStyle: { backgroundColor: colors.photoBarScrim },
          headerTintColor: colors.onBand,
          headerTitleStyle: { color: colors.onBand },
          headerBackVisible: false,
          unstable_headerLeftItems: () => [doneItem],
          unstable_headerRightItems: () => (menuItem ? [menuItem] : []),
          ...(Platform.OS === 'android'
            ? {
                headerLeft: () => (
                  <Pressable
                    accessibilityRole="button"
                    onPress={close}
                    style={styles.androidDone}
                  >
                    <NativeText style={{ color: colors.onBand }}>
                      Done
                    </NativeText>
                  </Pressable>
                ),
              }
            : {}),
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.black,
          {
            opacity: drag.interpolate({
              inputRange: [0, height],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          },
        ]}
      />
      <Animated.View
        {...swipe.panHandlers}
        style={[styles.screen, { transform: [{ translateY: drag }] }]}
      >
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) =>
            setPage(Math.round(event.nativeEvent.contentOffset.x / width))
          }
        >
          {photos.map((p) => (
            <ZoomPage
              key={pictureKey(p)}
              photo={p}
              width={width}
              height={height}
              onZoom={setZoomed}
              onToggleChrome={() => setChrome((v) => !v)}
            />
          ))}
        </ScrollView>
      </Animated.View>
      {!photos.length ? (
        // Never a bare black page: say what is happening, on the black.
        <View style={styles.status} testID="photo-viewer-status">
          {!read.record && !read.error ? (
            <ActivityIndicator
              color={colors.onBand}
              accessibilityLabel="Loading photographs"
            />
          ) : (
            <>
              <Text
                wordSafe
                variant="body"
                style={{ color: colors.onBand, textAlign: 'center' }}
              >
                {read.record
                  ? 'No photographs for this year'
                  : 'Photographs couldn’t be loaded'}
              </Text>
              {read.record ? null : (
                <Pressable
                  accessibilityRole="button"
                  onPress={read.retry}
                  style={styles.retry}
                  testID="photo-viewer-retry"
                >
                  <Text
                    variant="body"
                    style={{
                      color: colors.onBand,
                      textDecorationLine: 'underline',
                    }}
                  >
                    {copy.tryAgain}
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      ) : null}
      {current && chrome ? (
        <View
          style={[styles.panel, { backgroundColor: glass ? undefined : band }]}
        >
          {glass ? (
            <GlassView
              style={StyleSheet.absoluteFill}
              glassEffectStyle="regular"
              colorScheme="dark"
            />
          ) : null}
          <ScrollView contentContainerStyle={styles.panelContent}>
            <Text wordSafe variant="body" style={{ color: colors.onBand }}>
              {current.caption}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Photo: ${current.author}, ${current.licence}.`}
              accessibilityHint="Double-tap for the source and licence."
              onPress={() => openPhotoSource(current, 'photo-viewer-source')}
              style={styles.credit}
              testID={`photo-viewer-credit-${pictureKey(current)}`}
            >
              <Text
                wordSafe
                variant="footnote"
                style={{ color: colors.onBandSoft }}
              >
                {`Photo: ${current.author} · `}
                <Text
                  variant="footnote"
                  style={{
                    color: colors.onBand,
                    textDecorationLine: 'underline',
                  }}
                >
                  {current.licence}
                </Text>
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  black: { backgroundColor: PHOTO_BLACK },
  zoomContent: { flexGrow: 1, justifyContent: 'center' },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '40%',
    overflow: 'hidden',
  },
  panelContent: {
    gap: rhythm.line,
    paddingHorizontal: rhythm.screen,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.section,
  },
  credit: { minHeight: minimumTarget, justifyContent: 'center' },
  status: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: rhythm.block,
    paddingHorizontal: rhythm.screen,
  },
  retry: {
    minHeight: minimumTarget,
    minWidth: minimumTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidDone: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
