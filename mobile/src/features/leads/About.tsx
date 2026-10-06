import { useMemo } from 'react';
import type { Discovery } from '../../api/catalog-decoders';
import {
  AsAtLine,
  Group,
  Section,
  SourceLink,
  Text,
} from '../../design/primitives';
import { spacing } from '../../design/tokens';
import { aboutLede, discoveryAsOf, leadsFor } from './model';

/**
 * The web's "About these numbers" (renderDiscoveryPage): its lede, the
 * export's methodology in full, the as-at line and the registers the
 * example records open. Shown under the leads and under every comparison.
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
  const registers = useMemo(() => {
    const found = new Map<string, string>();
    for (const lead of leadsFor(discovery))
      for (const item of lead.evidence)
        if (item.url && !found.has(item.register))
          found.set(item.register, item.url);
    return [...found];
  }, [discovery]);
  return (
    <Section title="About these numbers" testID={testID}>
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
      {registers.map(([name, url], index) => (
        <SourceLink
          key={name}
          citation={name}
          url={url}
          kind="register"
          testID={`${testID}-register-${index}`}
        />
      ))}
    </Section>
  );
}
