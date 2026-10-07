import type { DiscoverySignal } from '../../api/catalog-decoders';
import { isOrganisation } from './privacy';
export function publicSignal(signal: DiscoverySignal) {
  const names = [
    signal.entity,
    ...(signal.chart?.participants.map((p) => p.name) ?? []),
  ];
  const privateNames = [...new Set(names.filter((n) => !isOrganisation(n)))];
  const unnamed =
    signal.category === 'recipient_concentration'
      ? 'Individual donor (not named in the app)'
      : 'Individual supplier (not named in the app)';
  const redact = (s: string) =>
    privateNames.reduce(
      (text, n) =>
        text.replace(
          new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          unnamed,
        ),
      s,
    );
  return {
    ...signal,
    entity: redact(signal.entity),
    title: redact(signal.title),
    summary: redact(signal.summary),
    evidence: signal.evidence.map((e) => ({ ...e, label: redact(e.label) })),
    chart: signal.chart
      ? {
          ...signal.chart,
          leading_name: redact(signal.chart.leading_name),
          participants: signal.chart.participants.map((p) => ({
            ...p,
            name: redact(p.name),
          })),
        }
      : undefined,
  };
}
