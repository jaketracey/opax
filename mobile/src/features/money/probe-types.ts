import type { MoneyGraph } from './data';
export interface MoneyTestHookProps {
  graph: MoneyGraph;
  onYear: (year: number) => void;
  onFocus: (id: string) => void;
}
