import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type TextStyle,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useAdaptiveDevice } from '../design/adaptive';
import { ReservedRegionArea, useReservedRegions } from '../design/fold-area';
import { useReduceMotionSetting } from '../design/accessibility';
import { paletteFor } from '../design/palette';
import { fonts } from '../design/tokens.generated';
import {
  easeOut,
  lerp,
  letterWindow,
  name,
  progress,
  restWindow,
  splashLayout,
  type Line,
  type SplashLayout,
} from './choreography';
import { splashCopy } from './copy';
import { markFullSplashPlayed } from './played';
import {
  hideNativeSplash,
  launchSequence,
  splashPhase,
  splashReleased,
  subscribeSplash,
  type LaunchSequence,
} from './splash';
import { fadeStart, handoff, lockup, splash } from './timing';

// Brand artwork: the launch field is navy in both appearances, like the icon
// and the native launch screen it continues, so these are the light hexes
// and never `colors`, which resolve dark.
const brand = paletteFor('light');
const field = { ground: brand.navy, text: brand.paper } as const;

/** How long the cover waits for the sequence decision before taking the short one. */
const pendingCap = 300;

/**
 * The launch cover: the native splash's layers (the star and the "OPAX"
 * wordmark on navy). Existing phones draw them in the native position;
 * adaptive displays clear their safe area and reserved regions. See
 * navigation/DUO.md for the native launch-screen limit. Then one of two
 * sequences runs (timing.ts):
 *
 * - `short`: hold until `ready` (never past `handoff.latestFade` when
 *   `latest`), then crossfade out.
 * - `full`: the four letters of OPAX travel into the full name, one word a
 *   line, the rest of each word fading in beside its letter while the star
 *   settles above; a hold; then the field fades to the app beneath. A tap
 *   skips to the exit once the app is ready. Reduce Motion: the name
 *   crossfades in place of the unfold, and the exit is a plain fade.
 *
 * The app is mounted and loading underneath from the first frame. The cover
 * takes touches only to be skipped and is hidden from VoiceOver, which hears
 * the name once as it unfolds and then lands in the app. `instant`: the cover
 * is already hidden under the welcome's full-screen modal, so it goes
 * without a fade. `pending`: the sequence is not decided yet; the first frame
 * is the same either way, so the cover draws and only motion waits.
 */
export function LaunchHandoff(props: LaunchHandoffProps) {
  return (
    <ReservedRegionArea
      style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' }]}
    >
      <LaunchCover {...props} />
    </ReservedRegionArea>
  );
}

type LaunchHandoffProps = {
  ready: boolean;
  latest?: boolean;
  instant?: boolean;
  sequence?: LaunchSequence;
  onDone: () => void;
  testID?: string;
};

function LaunchCover({
  ready,
  latest = false,
  instant = false,
  sequence = 'short',
  onDone,
  testID = 'launch-handoff',
}: LaunchHandoffProps) {
  const frame = useWindowDimensions();
  const adaptive = useAdaptiveDevice();
  const insets = useContext(SafeAreaInsetsContext);
  const regions = useReservedRegions();
  const layout = useMemo(
    () =>
      splashLayout({
        width: frame.width,
        height: frame.height,
        fontScale: frame.fontScale,
        safeArea: adaptive ? (insets ?? undefined) : undefined,
        regions,
      }),
    [frame.width, frame.height, frame.fontScale, adaptive, insets, regions],
  );
  const reduced = useReduceMotionSetting();
  const [loaded, setLoaded] = useState(0);
  const drawn = loaded >= 2;
  // The layers are on screen and Reduce Motion is known: the cover is what
  // the reader sees from here, so the native splash can go.
  const shown = drawn && reduced !== null;
  const hidden = useRef(false);
  const shownAt = useRef(0);
  const [fallback, setFallback] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [exiting, setExiting] = useState(false);
  const started = useRef<'full' | 'short' | null>(null);
  const leaving = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const t = useSharedValue(0);
  const exit = useSharedValue(0);
  const later = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(fn, ms);
    timers.current.push(timer);
    return timer;
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(
    () => () => {
      cancelAnimation(t);
      cancelAnimation(exit);
    },
    [t, exit],
  );

  // Hide the native splash once the layers draw. Adaptive display placement
  // can differ from the view-centred native storyboard. Declared before
  // the effects below so `shownAt` is set when they first run.
  useEffect(() => {
    if (!shown || hidden.current) return;
    hidden.current = true;
    hideNativeSplash();
    shownAt.current = Date.now();
  }, [shown]);

  // A decision that never comes must not hold the cover: take the short one.
  useEffect(() => {
    if (!shown || sequence !== 'pending' || fallback) return;
    const timer = later(() => setFallback(true), pendingCap);
    return () => clearTimeout(timer);
  }, [shown, sequence, fallback, later]);
  const effective: 'full' | 'short' | null =
    sequence === 'pending' ? (fallback ? 'short' : null) : sequence;

  // The full sequence, once: settle, unfold (or crossfade), hold.
  useEffect(() => {
    if (!shown || reduced === null || effective !== 'full' || instant) return;
    if (started.current) return;
    started.current = 'full';
    const beats = reduced ? splash.reduced : splash.full;
    const unfold = reduced ? splash.reduced.crossfade : splash.full.unfold;
    later(() => {
      // A tap during the settle has already started the exit.
      if (leaving.current) return;
      t.set(
        withTiming(1, {
          duration: unfold,
          easing: reduced ? Easing.inOut(Easing.quad) : Easing.linear,
        }),
      );
      AccessibilityInfo.announceForAccessibility(splashCopy.announcement);
      later(() => setUnfolded(true), unfold + beats.hold);
    }, beats.settle);
  }, [shown, reduced, effective, instant, later, t]);

  // The exit, once: the field fades over `duration`, then the parent unmounts.
  const leave = useCallback(
    (duration: number) => {
      if (leaving.current) return;
      leaving.current = true;
      setExiting(true);
      exit.set(withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }));
      if (started.current === 'full') void markFullSplashPlayed();
      later(onDone, duration);
    },
    [exit, later, onDone],
  );

  // When the cover may go.
  useEffect(() => {
    if (!shown || reduced === null || exiting || effective === null) return;
    if (instant) {
      if (ready) leave(handoff.reducedFade);
      return;
    }
    if (effective === 'full') {
      if (!(unfolded || skipped) || !(ready || latest)) return;
      leave(
        skipped && !unfolded
          ? splash.skipExit
          : reduced
            ? splash.reduced.exit
            : splash.full.exit,
      );
      return;
    }
    started.current ??= 'short';
    const fade = reduced ? handoff.reducedFade : handoff.fade;
    const elapsed = Date.now() - shownAt.current;
    if (ready) {
      const timer = later(
        () => leave(fade),
        Math.max(0, fadeStart(elapsed, reduced) - elapsed),
      );
      return () => clearTimeout(timer);
    }
    if (!latest) return;
    const timer = later(
      () => leave(fade),
      Math.max(0, handoff.latestFade - elapsed),
    );
    return () => clearTimeout(timer);
  }, [
    shown,
    reduced,
    exiting,
    effective,
    instant,
    ready,
    latest,
    unfolded,
    skipped,
    later,
    leave,
  ]);

  const skip = useCallback(() => {
    if (started.current === 'full') setSkipped(true);
  }, []);
  const onLoad = useCallback(() => setLoaded((n) => n + 1), []);

  const motion = reduced === false && layout.travelClear;
  const scaleExit =
    motion &&
    ![...regions.divisions, ...regions.occlusions].some(
      (region) => region.active,
    );
  const fieldStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.get(),
  }));
  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scaleExit ? lerp(1, splash.exitScale, exit.get()) : 1 },
    ],
  }));
  const { star, canvas } = layout;
  const starShift = {
    x: star.to.x + star.to.size / 2 - (star.from.x + star.from.size / 2),
    y: star.to.y + star.to.size / 2 - (star.from.y + star.from.size / 2),
    scale: star.to.size / star.from.size,
  };
  const starWindow = splash.windows.star;
  const starStyle = useAnimatedStyle(() => {
    if (!motion) return { opacity: 1 - progress(t.get(), [0, 1]) };
    const p = easeOut(progress(t.get(), starWindow));
    return {
      opacity: 1,
      transform: [
        { translateX: lerp(0, starShift.x, p) },
        { translateY: lerp(0, starShift.y, p) },
        { scale: lerp(1, starShift.scale, p) },
      ],
    };
  });
  const starSettledStyle = useAnimatedStyle(() => ({
    opacity: progress(t.get(), [0, 1]),
  }));
  const swapWindow = splash.windows.swap;
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress(t.get(), motion ? swapWindow : [0, 1]),
  }));

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.field,
        { pointerEvents: exiting ? 'none' : 'auto' },
        fieldStyle,
      ]}
    >
      <StatusBar style="light" />
      <Pressable
        accessible={false}
        onPress={skip}
        style={StyleSheet.absoluteFill}
        testID={`${testID}-skip`}
      >
        <Animated.View style={[StyleSheet.absoluteFill, contentStyle]}>
          <Animated.Image
            source={require('../../assets/splash/star.png')}
            fadeDuration={0}
            onLoad={onLoad}
            onError={onLoad}
            testID={`${testID}-star`}
            style={[
              styles.layer,
              {
                left: star.from.x,
                top: star.from.y,
                width: star.from.size,
                height: star.from.size,
              },
              starStyle,
            ]}
          />
          {motion ? null : (
            <Animated.Image
              source={require('../../assets/splash/star.png')}
              fadeDuration={0}
              testID={`${testID}-star-settled`}
              style={[
                styles.layer,
                {
                  left: star.to.x,
                  top: star.to.y,
                  width: star.to.size,
                  height: star.to.size,
                },
                starSettledStyle,
              ]}
            />
          )}
          <Animated.Image
            source={require('../../assets/splash/wordmark.png')}
            fadeDuration={0}
            onLoad={onLoad}
            onError={onLoad}
            testID={`${testID}-wordmark`}
            style={[
              styles.layer,
              {
                left: canvas.x,
                top: canvas.y,
                width: lockup.width,
                height: lockup.height,
              },
              wordmarkStyle,
            ]}
          />
          {layout.lines.map((line, index) => (
            <NameLine
              key={line.text}
              line={line}
              index={index}
              layout={layout}
              motion={motion}
              t={t}
              testID={`${testID}-line-${index}`}
            />
          ))}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * One word of the name: the travelling letter of OPAX, any glyphs before it
 * and the rest of the word, each a Text placed by its pen on the baseline.
 * Every Text is the final size; the letter starts scaled to the wordmark's
 * 30pt about its pen, so at the default text size it only translates.
 */
function NameLine({
  line,
  index,
  layout,
  motion,
  t,
  testID,
}: {
  line: Line;
  index: number;
  layout: SplashLayout;
  motion: boolean;
  t: { get(): number };
  testID: string;
}) {
  const { size, glyph } = layout;
  const windows = {
    letter: letterWindow(index),
    rest: restWindow(index),
    swap: splash.windows.swap,
  };
  const { letter } = line;
  const travel = {
    x: letter.from.x - letter.to.x,
    y: letter.from.y - letter.to.y,
    scale: name.base / size,
  };
  const slide = name.slide * size;
  const letterStyle = useAnimatedStyle(() => {
    const shown = progress(t.get(), motion ? windows.swap : [0, 1]);
    if (!motion) return { opacity: shown, transform: [] };
    const p = easeOut(progress(t.get(), windows.letter));
    return {
      opacity: shown,
      transform: [
        { translateX: lerp(travel.x, 0, p) },
        { translateY: lerp(travel.y, 0, p) },
        { scale: lerp(travel.scale, 1, p) },
      ],
    };
  });
  const restStyle = useAnimatedStyle(() => {
    if (!motion) return { opacity: progress(t.get(), [0, 1]), transform: [] };
    const p = easeOut(progress(t.get(), windows.rest));
    return { opacity: p, transform: [{ translateX: lerp(-slide, 0, p) }] };
  });
  const beforeStyle = useAnimatedStyle(() => {
    if (!motion) return { opacity: progress(t.get(), [0, 1]), transform: [] };
    const p = easeOut(progress(t.get(), windows.rest));
    return {
      opacity: p,
      transform: [{ translateX: lerp(slide * 0.6, 0, p) }],
    };
  });
  const text: TextStyle = {
    fontFamily: fonts.serifBold,
    // a11y-ok(raw-font-size): the launch wordmark matches the native splash
    // frame for frame; the overlay is hidden from the reader and never scales.
    fontSize: size,
    lineHeight: glyph.height,
    color: field.text,
    includeFontPadding: false,
  };
  const top = line.baseline - glyph.ascent;
  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <Animated.Text
        allowFontScaling={false}
        numberOfLines={1}
        testID={`${testID}-letter`}
        style={[
          styles.glyph,
          text,
          { left: letter.to.x, top, transformOrigin: [0, glyph.ascent, 0] },
          letterStyle,
        ]}
      >
        {letter.text}
      </Animated.Text>
      {line.before ? (
        <Animated.Text
          allowFontScaling={false}
          numberOfLines={1}
          testID={`${testID}-before`}
          style={[
            styles.glyph,
            text,
            { left: line.before.x, top },
            beforeStyle,
          ]}
        >
          {line.before.text}
        </Animated.Text>
      ) : null}
      <Animated.Text
        allowFontScaling={false}
        numberOfLines={1}
        testID={`${testID}-rest`}
        style={[styles.glyph, text, { left: line.rest.x, top }, restStyle]}
      >
        {line.rest.text}
      </Animated.Text>
    </View>
  );
}

/** The root's cover, driven by the launch decision in splash.ts. */
export function RootLaunchHandoff({ onDone }: { onDone: () => void }) {
  const released = useSyncExternalStore(
    subscribeSplash,
    splashReleased,
    splashReleased,
  );
  const phase = useSyncExternalStore(subscribeSplash, splashPhase, splashPhase);
  const decided = useSyncExternalStore(
    subscribeSplash,
    launchSequence,
    launchSequence,
  );
  return (
    <LaunchHandoff
      ready={released}
      latest={phase === 'plain'}
      // Only a plain launch unfolds the name here; on a first launch the
      // welcome draws its own cover over this one and unfolds it there.
      sequence={phase === 'plain' ? decided : 'short'}
      // Under the welcome the cover is already out of sight: the welcome
      // draws its own copy of the splash and dissolves that instead.
      instant={phase === 'welcome' && released}
      onDone={onDone}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    ...StyleSheet.absoluteFill,
    backgroundColor: field.ground,
  },
  layer: { position: 'absolute' },
  glyph: { position: 'absolute' },
});
