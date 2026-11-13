import type { DiscoverySignal } from '../../api/catalog-decoders';
import { isOrganisation } from './privacy';
import { isPartialCatalog, markPartial } from '../../api/validation';
export function publicSignal(signal: DiscoverySignal) {
  const names = [
    signal.entity,
    ...(signal.chart?.participants.map((p) => p.name) ?? []),
  ];
  // Donors are named as the web names them: party funding contributors and
  // "companies in both" keep their names. Suppliers in a contracts lead keep
  // the recipient gate (./privacy).
  const named = (n: string) =>
    signal.category !== 'procurement_concentration' || isOrganisation(n);
  const privateNames = [...new Set(names.filter((n) => !named(n)))];
  const unnamed = 'Individual supplier (not named in the app)';
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

/**
 * The discovery export as every screen reads it (Leads, a lead, Discover):
 * every signal is kept, with private supplier names replaced (publicSignal).
 */
export function publicDiscovery<D extends { signals: DiscoverySignal[] }>(
  discovery: D,
): D {
  return markPartial(
    { ...discovery, signals: discovery.signals.map(publicSignal) },
    isPartialCatalog(discovery),
  );
}
