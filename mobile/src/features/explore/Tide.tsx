import {
  PadGrid,
  Screen,
  Section,
  Group,
  Text,
  SegmentedControl,
  LinkRow,
  Disclosure,
} from '../../design/primitives';
import { useCallback, useState } from 'react';
import { topicNames } from '../reports/model';
import { useRead, ReadState, ShareBars } from '../reports/parts';
import { openTopicWindow } from '../reports/open';
import { explore } from './runtime';
import { TIDE_NOTE } from './model';
import { ExploreHeader } from './parts';
export default function Tide() {
  const [scope, setScope] = useState<'federal' | 'all'>('federal'),
    [order, setOrder] = useState('rising');
  const load = useCallback(() => explore.tide(scope), [scope]),
    read = useRead(load);
  return (
    <>
      <ExploreHeader title="The tide" game="tide" />
      <Screen column="wide" testID="explore-tide-screen">
        <Section
          title="The tide"
          info={{
            title: 'How to read the tide',
            notes: [
              TIDE_NOTE.replace(
                'Federal parliament',
                scope === 'federal'
                  ? 'Federal parliament'
                  : 'all five parliaments',
              ),
            ],
          }}
        >
          <Text wordSafe variant="lede">
            How parliament’s labelled debates move across four decades
          </Text>
          <Text variant="strong">Parliaments</Text>
          <SegmentedControl
            segments={[
              { value: 'federal', label: 'Federal' },
              { value: 'all', label: 'All five' },
            ]}
            value={scope}
            onChange={(v) => setScope(v as 'federal' | 'all')}
          />
          <Text variant="strong">Order</Text>
          <SegmentedControl
            segments={[
              { value: 'rising', label: 'Rising' },
              { value: 'fading', label: 'Fading' },
              { value: 'now', label: 'Biggest now' },
            ]}
            value={order}
            onChange={setOrder}
          />
        </Section>
        <ReadState
          read={read}
          citation="OPAX labelled speeches by decade"
          testID="tide"
        >
          {(data) => {
            const metric = (slug: string) => {
              const points = data.topics[slug] ?? [];
              return {
                now: points.at(-1)?.share ?? 0,
                change: (points.at(-1)?.share ?? 0) - (points[0]?.share ?? 0),
              };
            };
            const slugs = Object.keys(topicNames).sort((a, b) => {
              const am = metric(a),
                bm = metric(b);
              return (
                (order === 'now'
                  ? bm.now - am.now
                  : order === 'fading'
                    ? am.change - bm.change
                    : bm.change - am.change) ||
                topicNames[a]!.localeCompare(topicNames[b]!)
              );
            });
            return (
              <Group>
                <Text variant="fine" wordSafe>
                  Shares of labelled speeches, not the whole corpus
                </Text>
                <PadGrid>
                  {slugs.map((slug) => (
                    <Section key={slug} title={topicNames[slug]}>
                      <LinkRow
                        title={`${order === 'now' ? (metric(slug).now * 100).toFixed(1) + '%' : `${metric(slug).change >= 0 ? '+' : '−'}${Math.abs(metric(slug).change * 100).toFixed(1)} pp`}`}
                        onPress={() =>
                          openTopicWindow(slug, {}, topicNames[slug]!)
                        }
                      />
                      <ShareBars
                        label={topicNames[slug]!}
                        points={(data.topics[slug] ?? []).map((p) => ({
                          label:
                            data.decades.find((d) => d.slug === p.decade)
                              ?.label ?? p.decade,
                          share: p.share,
                          count: p.count,
                        }))}
                        onSelect={(i) => {
                          const point = data.topics[slug]?.[i],
                            d = data.decades.find(
                              (d) => d.slug === point?.decade,
                            );
                          if (d)
                            openTopicWindow(
                              slug,
                              {
                                from: String(d.from),
                                to: String(d.to),
                                ...(scope === 'federal'
                                  ? { state: 'federal' }
                                  : {}),
                              },
                              topicNames[slug]!,
                            );
                        }}
                      />
                    </Section>
                  ))}
                </PadGrid>
                <Section title="Coverage">
                  <Disclosure label="Labelled record by decade">
                    <Group>
                      {data.decades.map((d) => (
                        <Text key={d.slug} wordSafe>
                          {d.label}: {d.labelled.toLocaleString('en-AU')} of{' '}
                          {d.total.toLocaleString('en-AU')} speeches labelled (
                          {(d.coverage * 100).toFixed(1)}%)
                        </Text>
                      ))}
                    </Group>
                  </Disclosure>
                </Section>
              </Group>
            );
          }}
        </ReadState>
      </Screen>
    </>
  );
}
