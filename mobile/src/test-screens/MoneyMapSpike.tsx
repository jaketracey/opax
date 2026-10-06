import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View, type LayoutChangeEvent } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { apiClient } from '../api/runtime';
import type { RecordResult } from '../api/client';
import {
  Button,
  Screen,
  Text,
  Heading,
  AsAtLine,
  Group,
} from '../design/primitives';
import { useReduceMotion } from '../design/accessibility';
import { decodeMoneyGraph, type MoneyGraph } from '../features/money/data';
import {
  NativeMoneyScene,
  type ProjectedLabel,
} from '../features/money/NativeMoneyScene';

import {
  MoneyMapLabels,
  moneyLabelGroups,
} from '../features/money/MoneyMapLabels';

function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))] ??
    0
  );
}
/** Phase-one lab only. Metro excludes both this screen and its route from production. */
export default function MoneyMapSpike() {
  const params = useLocalSearchParams<{
    benchmark?: string;
    seconds?: string;
    leave?: string;
  }>();
  const router = useRouter();
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(0);
  const [record, setRecord] = useState<RecordResult<MoneyGraph> | null>(null);
  const labelGroups = useMemo(
    () => (record ? moneyLabelGroups(record.data) : []),
    [record],
  );
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 350 });
  const [generation, setGeneration] = useState(0);
  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const [ready, setReady] = useState(false);
  const [probe, setProbe] = useState('Waiting for native pixels');
  const [summary, setSummary] = useState('Not measured');
  const [selected, setSelected] = useState<string | null>(null);
  const engine = useRef<NativeMoneyScene | null>(null);
  const raf = useRef<number | null>(null);
  const visible = useRef(false);
  const foreground = useRef(AppState.currentState === 'active');
  const reduced = useReduceMotion();
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  const benchmark = useRef<{
    started: number;
    intervals: number[];
    submit: number[];
    previous: number;
  } | null>(null);
  const first = useRef<number | null>(null);
  const frames = useRef(0);
  const lastLabels = useRef(0);
  const lastFrame = useRef(0);
  const lastTap = useRef(0);
  const mounted = useRef(true);
  const inkPixels = useRef(0);
  const orbitDuration = useRef(10000);
  const writeMeasurement = useCallback((data: Record<string, unknown>) => {
    try {
      new File(Paths.cache, 'money-spike-result.json').write(
        JSON.stringify(data),
      );
    } catch {
      /* Evidence IO must not alter the renderer. */
    }
  }, []);
  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);
  const fail = useCallback(
    (cause: unknown) => {
      stop();
      setError(cause instanceof Error ? cause.message : String(cause));
      setReady(false);
      writeMeasurement({
        status: 'failed',
        error: cause instanceof Error ? cause.message : String(cause),
        drawnFrames: frames.current,
      });
      engine.current?.dispose();
      engine.current = null;
    },
    [stop, writeMeasurement],
  );
  const loop = useCallback(
    function frame() {
      if (
        !mounted.current ||
        !visible.current ||
        !foreground.current ||
        !engine.current
      ) {
        raf.current = null;
        return;
      }
      const now = performance.now();
      // 30 completed frames/s is sufficient for an interactive money map.
      if (now - lastFrame.current < 32) {
        raf.current = requestAnimationFrame(frame);
        return;
      }
      lastFrame.current = now;
      try {
        const run = benchmark.current;
        if (run) {
          engine.current.orbit(1.6, 0);
          if (now - lastTap.current > 5000) {
            const id =
              Math.floor((now - run.started) / 5000) % 2 ? 'party:Labor' : null;
            engine.current.focus(id);
            setSelected(id);
            lastTap.current = now;
          }
          if (run.previous) run.intervals.push(now - run.previous);
          run.previous = now;
        }
        const submit = performance.now();
        engine.current.render(now);
        if (first.current === null) {
          const ink = engine.current.verifyPixels();
          inkPixels.current = ink;
          setReady(true);
          first.current = performance.now() - started.current;
          setProbe(
            `Native pixels verified: ${ink}; first frame ${first.current.toFixed(1)} ms`,
          );
        }
        if (frames.current === 0)
          writeMeasurement({
            status: 'first-frame',
            firstFrameMs: first.current,
            inkPixels: inkPixels.current,
            drawnFrames: 1,
          });
        engine.current.endFrame();
        frames.current++;
        if (run) {
          run.submit.push(performance.now() - submit);
          if (now - run.started >= orbitDuration.current) {
            setSummary(
              `Orbit complete: ${run.intervals.length} frames; interval median ${percentile(run.intervals, 0.5).toFixed(1)} ms, p95 ${percentile(run.intervals, 0.95).toFixed(1)} ms; JS submit median ${percentile(run.submit, 0.5).toFixed(1)} ms; first ${first.current.toFixed(1)} ms`,
            );
            const readbackStarted = performance.now();
            const finalInkPixels = engine.current.verifyPixels();
            const gpuReadbackMs = performance.now() - readbackStarted;
            writeMeasurement({
              ...engine.current.diagnostics(),
              finalInkPixels,
              gpuReadbackMs,
              orbitSeconds: orbitDuration.current / 1000,
              status: 'orbit-complete',
              firstFrameMs: first.current,
              inkPixels: inkPixels.current,
              drawnFrames: frames.current,
              orbitFrames: run.intervals.length,
              intervalMedianMs: percentile(run.intervals, 0.5),
              intervalP95Ms: percentile(run.intervals, 0.95),
              completionMedianMs: percentile(run.submit, 0.5),
              completionP95Ms: percentile(run.submit, 0.95),
              jsSubmitMedianMs: percentile(run.submit, 0.5),
              jsSubmitP95Ms: percentile(run.submit, 0.95),
            });
            benchmark.current = null;
            if (params.leave === '1')
              exitTimer.current = setTimeout(() => {
                if (router.canGoBack()) router.back();
                else router.replace('/');
              }, 5000);
          }
        }
        if (now - lastLabels.current > 200) {
          setLabels(engine.current.labels());
          lastLabels.current = now;
        }
        raf.current = requestAnimationFrame(frame);
      } catch (cause) {
        fail(cause);
      }
    },
    [fail, writeMeasurement, params.leave, router],
  );
  useEffect(() => {
    orbitDuration.current =
      Math.max(10, Math.min(300, Number(params.seconds) || 10)) * 1000;
    if (ready && params.benchmark === '1')
      benchmark.current = {
        started: performance.now(),
        intervals: [],
        submit: [],
        previous: 0,
      };
  }, [ready, params.benchmark, params.seconds]);
  const start = useCallback(() => {
    if (
      raf.current === null &&
      engine.current &&
      visible.current &&
      foreground.current
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
    const sub = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active';
      if (foreground.current) start();
      else stop();
    });
    return () => sub.remove();
  }, [start, stop]);
  useEffect(() => {
    engine.current?.setReducedMotion(reduced);
  }, [reduced]);
  useEffect(() => {
    mounted.current = true;
    started.current = performance.now();
    void apiClient.get('/graph/money.json', decodeMoneyGraph).then((value) => {
      if (mounted.current) setRecord(value);
    }, fail);
    return () => {
      mounted.current = false;
      if (exitTimer.current) clearTimeout(exitTimer.current);
      stop();
      engine.current?.dispose();
      engine.current = null;
    };
  }, [fail, stop]);
  const context = (gl: ExpoWebGLRenderingContext) => {
    if (!mounted.current || !record) return;
    try {
      engine.current = new NativeMoneyScene(
        gl,
        record.data,
        size.width,
        size.height,
      );
      engine.current.setReducedMotion(reducedRef.current);
      start();
    } catch (cause) {
      fail(cause);
    }
  };
  const focus = (id: string | null) => {
    setSelected(id);
    engine.current?.focus(id);
  };
  const lastPan = useRef({ x: 0, y: 0 });
  const lastScale = useRef(1);
  const beginPan = useCallback(() => {
    lastPan.current = { x: 0, y: 0 };
  }, []);
  const updatePan = useCallback(
    (event: { translationX: number; translationY: number }) => {
      engine.current?.orbit(
        event.translationX - lastPan.current.x,
        event.translationY - lastPan.current.y,
      );
      lastPan.current = { x: event.translationX, y: event.translationY };
    },
    [],
  );
  const beginPinch = useCallback(() => {
    lastScale.current = 1;
  }, []);
  const updatePinch = useCallback((event: { scale: number }) => {
    engine.current?.zoom(event.scale / lastScale.current);
    lastScale.current = event.scale;
  }, []);
  const endTap = useCallback((event: { x: number; y: number }) => {
    const id = engine.current?.pick(event.x, event.y) ?? null;
    setSelected(id);
    engine.current?.focus(id);
  }, []);
  // Gesture builder stores callbacks; they read refs only when native input fires.
  const gesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Race(
          Gesture.Pan()
            .maxPointers(1)
            .runOnJS(true)
            .onBegin(beginPan)
            .onUpdate(updatePan),
          Gesture.Tap().runOnJS(true).onEnd(endTap),
        ),
        Gesture.Pinch().runOnJS(true).onBegin(beginPinch).onUpdate(updatePinch),
      ),
    [beginPan, updatePan, endTap, beginPinch, updatePinch],
  );
  const node = record?.data.nodes.find((n) => n.id === selected);
  const layout = (event: LayoutChangeEvent) => {
    setSize({ width: event.nativeEvent.layout.width, height: 350 });
  };
  return (
    <Screen testID="money-spike-screen">
      <Heading level={2}>Native money map spike</Heading>
      <Text>Political donations &amp; public money map</Text>
      <Text variant="fine">
        Phase 1 · {record?.data.nodes.length ?? '…'} nodes and{' '}
        {record?.data.edges.length.toLocaleString('en-AU') ?? '…'} flows ·
        simulator measurements
      </Text>
      <View onLayout={layout} style={{ minHeight: 350 }}>
        {record && size.width > 0 && !error ? (
          <GestureHandlerRootView style={{ height: 350 }}>
            <GestureDetector gesture={gesture}>
              <View
                style={{ height: 350 }}
                testID="money-spike-canvas"
                accessibilityLabel="Three dimensional money map. Drag to orbit, pinch to zoom, tap to focus."
              >
                <GLView
                  key={generation}
                  style={{ flex: 1 }}
                  msaaSamples={0}
                  onContextCreate={context}
                />
                <MoneyMapLabels
                  groups={labelGroups}
                  labels={labels}
                  width={size.width}
                  labelWidth={100}
                  clamp={false}
                />
              </View>
            </GestureDetector>
          </GestureHandlerRootView>
        ) : (
          <Text testID="money-spike-error">
            {error ?? 'Loading reviewed graph…'}
          </Text>
        )}
      </View>
      <Text testID="money-spike-probe" variant="fine">
        {probe}
      </Text>
      <Text testID="money-spike-metrics" variant="fine">
        {summary}
      </Text>
      <Group>
        <Button
          label="Measure ten seconds of orbit"
          testID="money-spike-measure"
          disabled={!!error || !ready}
          onPress={() => {
            benchmark.current = {
              started: performance.now(),
              intervals: [],
              submit: [],
              previous: 0,
            };
            setSummary('Measuring orbit');
          }}
        />
        <Button
          label="Focus Labor"
          testID="money-spike-focus"
          disabled={!!error || !record}
          onPress={() => focus('party:Labor')}
        />
        <Button label="Fit map" onPress={() => focus(null)} />
        {error ? (
          <Button
            label="Recreate GL context"
            onPress={() => {
              setError(null);
              first.current = null;
              setGeneration((n) => n + 1);
            }}
          />
        ) : null}
      </Group>
      {node ? (
        <Group testID="money-spike-card">
          <Heading>{node.label}</Heading>
          <Text>
            {node.total.toLocaleString('en-AU', {
              style: 'currency',
              currency: 'AUD',
              maximumFractionDigits: 0,
            })}{' '}
            disclosed receipts
          </Text>
          <Text>
            {node.firstYear}–{node.lastYear}
          </Text>
        </Group>
      ) : null}
      {record ? (
        <AsAtLine
          asOf={record.asOf}
          savedAt={record.savedAt}
          citation="AEC disclosure returns"
          licence="CC BY 4.0"
        />
      ) : null}
      <Text variant="fine">
        AEC disclosure data: donations under the disclosure threshold are not
        reported and cannot appear here, so totals are a floor, not a ceiling.
      </Text>
    </Screen>
  );
}
