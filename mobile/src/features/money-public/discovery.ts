import type { DiscoverySignal } from '../../api/catalog-decoders';
import { isOrganisation } from './privacy';
import { isOrganisationDonor } from '../../privacy/donorEntity';
import { isPartialCatalog, markPartial } from '../../api/validation';
export function publicSignal(signal: DiscoverySignal) {
  const names = [
    signal.entity,
    ...(signal.chart?.participants.map((p) => p.name) ?? []),
  ];
  // Party funding names donors and "companies in both" a donor: those pass
  // the donor gate (privacy/donorEntity); suppliers keep the recipient gate.
  const donorNames = signal.category !== 'procurement_concentration';
  const named = (n: string) =>
    (signal.category === 'recipient_concentration' || isOrganisation(n)) &&
    (!donorNames || isOrganisationDonor({ label: n }));
  const privateNames = [...new Set(names.filter((n) => !named(n)))];
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

/**
 * The discovery export as every screen reads it (Leads, a lead, Discover):
 * a "companies in both" lead is about its entity, so one whose entity is not
 * named is left out and counted in `withheld`; every other signal has its
 * private names replaced (publicSignal).
 */
export function publicDiscovery<D extends { signals: DiscoverySignal[] }>(
  discovery: D,
): D & { withheld: number } {
  const shown = discovery.signals.filter(
    (s) =>
      s.category !== 'donor_contract_overlap' ||
      (isOrganisation(s.entity) && isOrganisationDonor({ label: s.entity })),
  );
  return markPartial(
    {
      ...discovery,
      signals: shown.map(publicSignal),
      withheld: discovery.signals.length - shown.length,
    },
    isPartialCatalog(discovery),
  );
}
