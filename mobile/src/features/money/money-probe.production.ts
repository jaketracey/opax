import type {
  MoneyMapPerf,
  MoneyMapProbe,
  MoneyTestHookProps,
} from './probe-types';

// Production ships no journey hooks, pixel readback or frame sampling.
export function MoneyTestHooks(_props: MoneyTestHookProps) {
  return null;
}
export const useMoneyMapProbe: MoneyMapProbe = () => 'money-map-canvas';
export const useMoneyMapPerf: MoneyMapPerf = () => null;
