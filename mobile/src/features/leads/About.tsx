import type { Discovery } from '../../api/catalog-decoders';
import { AsAtLine, Group, Section, Text } from '../../design/primitives';
import { spacing } from '../../design/tokens';
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
 * The web's "About these numbers" (renderDiscoveryPage): its lede, the
 * export's methodology in full and the as-at line. The registers the example
 * records open are listed on Sources and licences. Shown under the leads and
 * under every comparison.
 */
export function AboutLeads({
  discovery,
  savedAt,
  lede = false,
  testID,
}: {
  discovery: Discovery;
  savedAt: number | null;
  /** Repeat the lede where the screen does not open with it. */
  lede?: boolean;
  testID: string;
}) {
  return (
    <Section
      title="About these numbers"
      icon="info.circle"
      accent="leads"
      testID={testID}
    >
      {lede ? (
        <Text wordSafe testID={`${testID}-lede`}>
          {aboutLede(discovery)}
        </Text>
      ) : null}
      <Group gap={spacing.s3}>
        {discovery.methodology.map((method, index) => (
          <Text
            key={index}
            wordSafe
            variant="fine"
            tone="ink"
            testID={`${testID}-method-${index}`}
          >
            {method}
          </Text>
        ))}
      </Group>
      <AsAtLine
        asOf={discoveryAsOf(discovery)}
        citation={['AEC annual returns', 'AusTender']}
        savedAt={savedAt}
        testID={`${testID}-as-at`}
      />
    </Section>
  );
}
