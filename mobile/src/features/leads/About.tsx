import type { Discovery } from '../../api/catalog-decoders';
import type { SourceDetails } from '../../design/primitives';
import { aboutLede, discoveryAsOf, leadsFor } from './model';

/** The registers the example records open, once each (Sources and licences). */
export function leadRegisters(discovery: Discovery): [string, string][] {
  const found = new Map<string, string>();
  for (const lead of leadsFor(discovery))
    for (const item of lead.evidence)
      if (item.url && !found.has(item.register))
        found.set(item.register, item.url);
  return [...found];
}

/**
 * The web's "About these numbers" (renderDiscoveryPage) as one source line:
 * the export's date and publishers on the line; its lede and methodology in
 * full in the sheet. The registers the example records open are listed on
 * Sources and licences. Once at the top of the leads and at the foot of
 * every comparison.
 */
export function leadsSource(
  discovery: Discovery,
  savedAt: number | null,
): SourceDetails & { title: string } {
  return {
    title: 'About these numbers',
    asOf: discoveryAsOf(discovery),
    citation: ['AEC annual returns', 'AusTender'],
    savedAt,
    notes: [aboutLede(discovery), ...discovery.methodology],
  };
}
