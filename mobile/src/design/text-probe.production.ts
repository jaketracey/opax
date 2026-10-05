import type { ProbeFrame, ProbeLine, ProbeProps } from './text-probe.types';

// No hooks, line measurements, diagnostic props or labels in production.
export const nameProbeProps = {};
const noop = (_lines?: readonly ProbeLine[], _frame?: ProbeFrame) => {};
export function useTextProbe(
  props: ProbeProps,
  _key: string,
  _content: string,
) {
  return { props, enabled: false, update: noop, reset: noop };
}
