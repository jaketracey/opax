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
import { AppState, PixelRatio, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Button,
  Group,
  Text,
  useAccessibilitySize,
  useReduceMotionSetting,
} from '../../design/primitives';
import { colors, spacing } from '../../design/tokens';
import type { MoneyGraph } from './data';
import { NativeMoneyScene, type ProjectedLabel } from './NativeMoneyScene';
import { moneyProbeId } from './money-probe';
import { MoneyMapLabels, moneyLabelGroups } from './MoneyMapLabels';

export interface NativeMoneyMapHandle {
  focus: (id: string) => void;
}
export function NativeMoneyMap({
  graph,
  view,
  active,
  onSelect,
  ref,
}: {
  graph: MoneyGraph;
  view: MoneyGraph;
  active: boolean;
  onSelect: (id: string) => void;
  ref?: Ref<NativeMoneyMapHandle>;
}) {
  const labelGroups = useMemo(() => moneyLabelGroups(graph), [graph]);
  const [size, setSize] = useState({ width: 0, height: 350 });
  const [generation, setGeneration] = useState(0);
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
  const accessibilitySize = useAccessibilitySize();
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
  const fail = useCallback(() => {
    release();
    if (mounted.current) {
      setError(true);
      setLabels([]);
      setProbe('money-map-canvas');
    }
  }, [release]);
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
        scene.render(now);
        if (!pixels.current) pixels.current = scene.verifyPixels();
        scene.endFrame();
        if (!probed.current && scene.diagnostics().completedFrames >= 2) {
          probed.current = true;
          setProbe(
            moneyProbeId(scene.diagnostics().completedFrames, pixels.current),
          );
        }
        if (now - lastErrorCheck.current >= 1000 && glContext.current) {
          const gl = glContext.current;
          // Expo's native isContextLost() is a stub; GL errors or invalid-context
          // exceptions remove this view and offer a fresh owned context.
          if (gl.getError() !== gl.NO_ERROR)
            throw new Error('Native GL context unavailable');
          lastErrorCheck.current = now;
        }
        if (now - lastLabels.current >= 200) {
          setLabels(scene.labels());
          lastLabels.current = now;
        }
        raf.current = requestAnimationFrame(frame);
      } catch {
        fail();
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
        pixels.current = 0;
        probed.current = false;
        lastFrame.current = 0;
        start();
      } catch {
        fail();
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
  const gesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Race(
          Gesture.Pan()
            .maxPointers(1)
            .runOnJS(true)
            .onBegin(() => {
              pan.current.x = pan.current.y = 0;
            })
            .onUpdate((event) => {
              engine.current?.orbit(
                event.translationX - pan.current.x,
                event.translationY - pan.current.y,
              );
              pan.current.x = event.translationX;
              pan.current.y = event.translationY;
            }),
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
    [focus],
  );
  return (
    <Group gap={spacing.s3}>
      {error ? (
        <Group>
          <Text wordSafe>
            The 3D view could not be drawn. The saved list and records remain
            available.
          </Text>
          <Button
            label="Try the 3D view again"
            onPress={() => {
              setError(false);
              setGeneration((n) => n + 1);
            }}
            testID="money-gl-retry"
          />
        </Group>
      ) : (
        <GestureDetector gesture={gesture}>
          <View
            testID={probe}
            accessible
            accessibilityRole="image"
            accessibilityLabel="Three dimensional money map. Drag with one finger to orbit, pinch to zoom, tap a node for its record. The list gives the same recorded figures."
            style={styles.canvas}
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              setSize((previous) =>
                previous.width === width ? previous : { width, height: 350 },
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
            {!accessibilitySize ? (
              <MoneyMapLabels
                groups={labelGroups}
                labels={labels}
                width={size.width}
              />
            ) : null}
          </View>
        </GestureDetector>
      )}
      <Text wordSafe variant="fine">
        Position is the category cluster, colour the category, size the
        connectedness, and depth fades through fog.
      </Text>
      <Button
        label="Fit map"
        disabled={error}
        onPress={() => engine.current?.focus(null)}
        testID="money-fit"
      />
    </Group>
  );
}
const styles = StyleSheet.create({
  canvas: { height: 350, backgroundColor: colors.paper, overflow: 'hidden' },
  gl: { flex: 1 },
});
