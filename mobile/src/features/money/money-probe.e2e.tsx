import { isE2E } from '../../design/environment';
import { Button, Group } from '../../design/primitives';
import { formatDisclosureYear } from '../../design/format';
import type { MoneyTestHookProps } from './probe-types';

export function moneyProbeId(completedFrames: number, pixels: number) {
  return isE2E && completedFrames >= 2 && pixels >= 50
    ? `money-map-drawn-frames-${completedFrames}-pixels-${pixels}`
    : 'money-map-canvas';
}
/** Accessible journey actions exercise the same selection/year callbacks as touch input. */
export function MoneyTestHooks({ graph, onYear, onFocus }: MoneyTestHookProps) {
  if (!isE2E) return null;
  const year = graph.edges.some((e) => e.byYear?.['2024'])
    ? 2024
    : Math.max(
        ...graph.edges.flatMap((e) =>
          e.firstYear === null ? [] : [e.firstYear],
        ),
      );
  const node =
    graph.nodes.find((n) => n.id === 'party:Labor') ??
    graph.nodes.find((n) => n.kind === 'party') ??
    graph.nodes[0];
  return (
    <Group>
      {Number.isFinite(year) ? (
        <Button
          label={`Show ${formatDisclosureYear(year)} only`}
          testID="money-test-year"
          onPress={() => onYear(year)}
        />
      ) : null}
      {node ? (
        <Button
          label={`Focus ${node.label}`}
          testID="money-test-focus"
          onPress={() => onFocus(node.id)}
        />
      ) : null}
    </Group>
  );
}
