import { useLayoutEffect } from 'react';
import { Settings } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { bundleStartedAt } from '../analytics/startup';
import { isE2E } from '../design/environment';

/**
 * In-app timing probe for local perf runs (PF5). E2E builds only: Metro
 * swaps in probe.production.ts for release, and a development build loads
 * this file but stays off. It is on only when the launch asks for it with
 * `-OPAXPerfProbe on` (`xcrun simctl launch <udid> <bundle> -OPAXPerfProbe
 * on`), so ordinary e2e flows write nothing.
 *
 * Marks stay in memory and go to Documents/opax-perf-marks.json, rewritten
 * 1.5 s after the last mark; `scripts/perf-probe.ts` reads them. They never
 * leave the device and never reach analytics.
 */
const PROBE_FILE = 'opax-perf-marks.json';
const LIMIT = 600;
let on: boolean | null = null;
function enabled() {
  if (on === null) {
    try {
      on = isE2E && String(Settings.get('OPAXPerfProbe') ?? '') === 'on';
    } catch {
      on = false;
    }
  }
  return on;
}
type Mark = [name: string, at: number, detail?: string | number[]];
const marks: Mark[] = [];
const once = new Set<string>();
let flush: ReturnType<typeof setTimeout> | undefined;
const round = (ms: number) => Math.round(ms * 10) / 10;
function record(mark: Mark) {
  if (marks.length >= LIMIT) marks.shift();
  marks.push(mark);
  clearTimeout(flush);
  flush = setTimeout(write, 1500);
}
function write() {
  try {
    new File(Paths.document, PROBE_FILE).write(
      JSON.stringify({
        wall: Date.now(),
        now: round(performance.now()),
        bundle: round(bundleStartedAt),
        marks,
      }),
    );
  } catch {
    // A local measurement aid: a failed write loses one run's marks only.
  }
}
export function perfMark(name: string, detail?: string) {
  if (!enabled()) return;
  record(
    detail === undefined
      ? [name, round(performance.now())]
      : [name, round(performance.now()), detail],
  );
}
/** The first time only in this launch, for marks in render paths. */
export function perfOnce(name: string, detail?: string) {
  if (!enabled() || once.has(name)) return;
  once.add(name);
  perfMark(name, detail);
}
type HermesStats = {
  js_allocatedBytes?: number;
  js_heapSize?: number;
  js_numGCs?: number;
};
/** Hermes heap counters: allocated bytes, heap size and GC count. */
export function perfHeap(name: string) {
  if (!enabled()) return;
  let stats: HermesStats | undefined;
  try {
    stats = (
      globalThis as {
        HermesInternal?: { getInstrumentedStats?: () => HermesStats };
      }
    ).HermesInternal?.getInstrumentedStats?.();
  } catch {
    stats = undefined;
  }
  record([
    name,
    round(performance.now()),
    [
      stats?.js_allocatedBytes ?? -1,
      stats?.js_heapSize ?? -1,
      stats?.js_numGCs ?? -1,
    ],
  ]);
}
/**
 * Marks the first frame drawn after this component's first commit (callers
 * pass constants, so it runs once per mount).
 */
export function useDrawnMark(name: string, detail?: string) {
  useLayoutEffect(() => {
    if (!enabled()) return;
    perfMark(`${name}-layout`, detail);
    const frame = requestAnimationFrame(() => perfMark(name, detail));
    return () => cancelAnimationFrame(frame);
  }, [name, detail]);
}
