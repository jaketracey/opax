import { Stack } from 'expo-router';
import { reports } from '../../api/runtime';
import {
  Group,
  Heading,
  Screen,
  SourceLink,
  Text,
} from '../../design/primitives';
import { shareHeaderItem } from '../../navigation/share';
import copy from './methods-copy.json';
import { ReadState, useRead } from './parts';

export default function Methods() {
  const corpus = useRead(reports.corpus);
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Methods',
          unstable_headerRightItems: () => [
            shareHeaderItem({ path: '/methods', title: 'Methods' }),
          ],
        }}
      />
      <Screen testID="methods-screen">
        {copy.map((block, i) => (
          <Group key={i}>
            {block.kind === 'h2' || block.kind === 'h3' ? (
              <Heading
                level={block.kind === 'h2' ? 1 : 2}
                testID={`methods-${i}`}
              >
                {block.text}
              </Heading>
            ) : (
              <Text wordSafe testID={`methods-${i}`}>
                {block.text.startsWith(
                  'State coverage windows differ by parliament',
                )
                  ? `State coverage windows differ by parliament.${
                      corpus.record
                        ? ' ' +
                          corpus.record.data.sources
                            .filter((s) =>
                              /^(NSW Parliament|Victorian Parliament|QLD Parliament)$/.test(
                                s.name,
                              ),
                            )
                            .map((s) => `${s.name}: ${s.coverage}`)
                            .join('; ') +
                          '.'
                        : ''
                    }`
                  : block.text}
              </Text>
            )}
            {block.text === 'Known limitations' ? (
              <ReadState
                read={corpus}
                citation="OPAX corpus manifest"
                testID="methods-defects"
              >
                {(data) => (
                  <Group>
                    {data.known_defects.map((d) => (
                      <Text wordSafe key={d}>
                        {d}
                      </Text>
                    ))}
                  </Group>
                )}
              </ReadState>
            ) : null}
            {block.text === 'Licence, code and corrections' ? (
              <SourceLink
                citation="github.com/jaketracey/opax"
                url="https://github.com/jaketracey/opax"
                kind="register"
              />
            ) : null}
          </Group>
        ))}
      </Screen>
    </>
  );
}
