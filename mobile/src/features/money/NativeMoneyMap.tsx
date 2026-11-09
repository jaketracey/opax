import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useFocusEffect } from 'expo-router';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  AppState,
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { isE2E } from '../../design/environment';
import {
  Icon,
  useLayout,
  useReduceMotionSetting,
} from '../../design/primitives';
import { colors, hairline, minimumTarget, rhythm } from '../../design/tokens';
import type { MoneyGraph } from './data';
import { moneyProbeId } from './money-probe';
import {
  MoneyMapLabels,
  moneyLabelGroups,
  moneyLabelParties,
} from './MoneyMapLabels';
import { NativeMoneyScene, type ProjectedLabel } from './NativeMoneyScene';
import { moneyMapLabel, moneySceneHeight } from './scene-size';

export interface NativeMoneyMapHandle {
  focus: (id: string) => void;
}
/** One element for VoiceOver; the scene's own parts are hidden. */
export { moneyMapLabel, moneySceneHeight };
// "Fit map" until the vocabulary gains the spec's
// arrow.up.left.and.arrow.down.right (Follow-up: src/design/symbols.ts).
const fitSymbol = 'arrow.up.left.and.arrow.down.right' as const;
export function NativeMoneyMap({
  graph,
  view,
  active,
  onSelect,
  onUnavailable,
  initialFocus,
  ref,
}: {
  graph: MoneyGraph;
  view: MoneyGraph;
  active: boolean;
  onSelect: (id: string) => void;
  onUnavailable?: () => void;
  /** A node the camera turns to once the scene is drawn (no push). */
  initialFocus?: string | null;
  ref?: Ref<NativeMoneyMapHandle>;
}) {
  const labelGroups = useMemo(() => moneyLabelGroups(graph), [graph]);
  const labelParties = useMemo(() => moneyLabelParties(graph), [graph]);
  const adaptive = useLayout();
  const window = useWindowDimensions();
  const canvasHeight = moneySceneHeight(window.width, adaptive.regular);
  const [size, setSize] = useState({ width: 0, height: canvasHeight });
  const [generation] = useState(0);
  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const [error, setError] = useState(false);
  const [probe, setProbe] = useState('money-map-canvas');
  const engine = useRef<NativeMoneyScene | null>(null);
  const glContext = useRef<ExpoWebGLRenderingContext | null>(null);
  const raf = useRef<number | null>(null);
  const mounted = useRef(true),
    visible = useRef(false);
  const foreground = useRef(AppState.currentState === 'active');
  const activeRef = useRef(active),
    viewRef = useRef(view),
    selectRef = useRef(onSelect);
  const reduced = useReduceMotionSetting();
  const reducedRef = useRef(reduced !== false);
  useLayoutEffect(() => {
    activeRef.current = active;
    viewRef.current = view;
    selectRef.current = onSelect;
    reducedRef.current = reduced !== false;
  }, [active, view, onSelect, reduced]);
  const focusRef = useRef(initialFocus ?? null);
  const lastFrame = useRef(0),
    lastLabels = useRef(0),
    lastErrorCheck = useRef(0);
  const pixels = useRef(0),
    probed = useRef(false);
  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);
  const release = useCallback(() => {
    stop();
    engine.current?.dispose();
    engine.current = null;
    glContext.current = null;
  }, [stop]);
  const fail = useCallback(
    (reason?: unknown) => {
      if (__DEV__ || isE2E) console.warn('Money map GL unavailable', reason);
      release();
      if (mounted.current) {
        setError(true);
        setLabels([]);
        setProbe('money-map-canvas');
        onUnavailable?.();
      }
    },
    [release, onUnavailable],
  );
  const loop = useCallback(
    function frame() {
      if (
        !mounted.current ||
        !visible.current ||
        !foreground.current ||
        !activeRef.current ||
        !engine.current
      ) {
        raf.current = null;
        return;
      }
      const now = performance.now();
      if (now - lastFrame.current < 32) {
        raf.current = requestAnimationFrame(frame);
        return;
      }
      lastFrame.current = now;
      try {
        const scene = engine.current;
        const drawn = scene.render(now);
        if (drawn !== false) {
          if (isE2E && !pixels.current) pixels.current = scene.verifyPixels();
          scene.endFrame();
        }
        if (
          isE2E &&
          !probed.current &&
          scene.diagnostics().completedFrames >= 2
        ) {
          probed.current = true;
          setProbe(
            moneyProbeId(scene.diagnostics().completedFrames, pixels.current),
          );
        }
        if (now - lastErrorCheck.current >= 1000 && glContext.current) {
          const gl = glContext.current;
          // Expo's native isContextLost() is a stub; GL errors or invalid-context
          // exceptions remove this view and offer a fresh owned context.
          const error = gl.getError();
          if (error === 0x9242) throw new Error('Native GL context lost');
          if (error !== gl.NO_ERROR && (__DEV__ || isE2E))
            console.warn('Money map GL diagnostic', error);
          lastErrorCheck.current = now;
        }
        if (drawn !== false && now - lastLabels.current >= 200) {
          setLabels(scene.labels());
          lastLabels.current = now;
        }
        raf.current = requestAnimationFrame(frame);
      } catch (reason) {
        fail(reason);
      }
    },
    [fail],
  );
  const start = useCallback(() => {
    if (
      raf.current === null &&
      mounted.current &&
      visible.current &&
      foreground.current &&
      activeRef.current &&
      engine.current
    )
      raf.current = requestAnimationFrame(loop);
  }, [loop]);
  useFocusEffect(
    useCallback(() => {
      visible.current = true;
      start();
      return () => {
        visible.current = false;
        stop();
      };
    }, [start, stop]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active';
      if (foreground.current) start();
      else stop();
    });
    return () => subscription.remove();
  }, [start, stop]);
  useEffect(() => {
    if (active) start();
    else stop();
  }, [active, start, stop]);
  useEffect(() => {
    engine.current?.setReducedMotion(reduced !== false);
  }, [reduced]);
  useEffect(() => {
    engine.current?.setView(view);
  }, [view]);
  useEffect(() => {
    engine.current?.resize(size.width, size.height, PixelRatio.get());
  }, [size]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      release();
    };
  }, [release]);
  const context = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      if (!mounted.current) return;
      try {
        release();
        glContext.current = gl;
        engine.current = new NativeMoneyScene(
          gl,
          graph,
          size.width,
          size.height,
        );
        engine.current.setView(viewRef.current);
        engine.current.setReducedMotion(reducedRef.current);
        if (focusRef.current) engine.current.focus(focusRef.current);
        pixels.current = 0;
        probed.current = false;
        lastFrame.current = 0;
        start();
      } catch (reason) {
        fail(reason);
      }
    },
    [graph, size.width, size.height, release, start, fail],
  );
  const focus = useCallback((id: string | null) => {
    engine.current?.focus(id);
    if (id) selectRef.current(id);
  }, []);
  useImperativeHandle(ref, () => ({ focus }), [focus]);
  const pan = useRef({ x: 0, y: 0 }),
    scale = useRef(1);
  // A one-finger pan starts only after 10 pt sideways, so a vertical drag
  // that starts on the scene scrolls the page; two fingers orbit freely.
  const orbit = useCallback(
    (event: { translationX: number; translationY: number }) => {
      engine.current?.orbit(
        event.translationX - pan.current.x,
        event.translationY - pan.current.y,
      );
      pan.current.x = event.translationX;
      pan.current.y = event.translationY;
    },
    [],
  );
  const gesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Race(
          Gesture.Pan()
            .maxPointers(1)
            .activeOffsetX([-10, 10])
            .failOffsetY([-10, 10])
            .runOnJS(true)
            .onBegin(() => {
              pan.current.x = pan.current.y = 0;
            })
            .onUpdate(orbit),
          Gesture.Pan()
            .minPointers(2)
            .runOnJS(true)
            .onBegin(() => {
              pan.current.x = pan.current.y = 0;
            })
            .onUpdate(orbit),
          Gesture.Tap()
            .runOnJS(true)
            .onEnd((event) =>
              focus(engine.current?.pick(event.x, event.y) ?? null),
            ),
        ),
        Gesture.Pinch()
          .runOnJS(true)
          .onBegin(() => {
            scale.current = 1;
          })
          .onUpdate((event) => {
            engine.current?.zoom(event.scale / scale.current);
            scale.current = event.scale;
          }),
      ),
    [focus, orbit],
  );
  // When GL fails the screen switches to the List view and greys the Map
  // segment; nothing is drawn here.
  if (error) return null;
  return (
    <View style={styles.stage}>
      <GestureDetector gesture={gesture}>
        <View
          testID={probe}
          accessible
          accessibilityRole="image"
          accessibilityLabel={moneyMapLabel}
          style={[styles.canvas, { height: canvasHeight }]}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setSize((previous) =>
              previous.width === width && previous.height === height
                ? previous
                : { width, height },
            );
          }}
        >
          {size.width > 0 ? (
            <GLView
              key={generation}
              style={styles.gl}
              msaaSamples={0}
              onContextCreate={context}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ) : null}
          <MoneyMapLabels
            groups={labelGroups}
            parties={labelParties}
            labels={labels}
            width={size.width}
          />
        </View>
      </GestureDetector>
      {/* A sibling over the canvas, so its touches never reach the scene. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fit map"
        onPress={() => engine.current?.focus(null)}
        testID="money-fit"
        style={({ pressed }) => [
          styles.fit,
          pressed ? { backgroundColor: colors.sunken } : null,
        ]}
      >
        <Icon name={fitSymbol} size={17} tone="ink" />
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  canvas: { backgroundColor: colors.paper, overflow: 'hidden' },
  gl: { flex: 1 },
  stage: { position: 'relative' },
  // A 44 pt round button in the scene's bottom-trailing corner.
  fit: {
    position: 'absolute',
    right: rhythm.block,
    bottom: rhythm.block,
    width: minimumTarget,
    height: minimumTarget,
    borderRadius: minimumTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.raised,
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
    borderCurve: 'continuous',
  },
});
