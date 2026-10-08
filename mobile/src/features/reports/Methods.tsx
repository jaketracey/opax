import { headerItems } from '../../navigation/chrome';
import { Stack, router } from 'expo-router';
import { reports } from '../../api/runtime';
import {
  Group,
  Heading,
  LinkRow,
  Screen,
  Section,
  Text,
} from '../../design/primitives';
import { shareHeaderItem } from '../../navigation/share';
import copy from './methods-copy.json';
import { useRead } from './parts';

const sections = copy.flatMap((block, index) =>
  block.kind === 'h3'
    ? [
        {
          title: block.text,
          index,
          body: copy.slice(
            index + 1,
            copy.findIndex((b, i) => i > index && b.kind === 'h3') === -1
              ? copy.length
              : copy.findIndex((b, i) => i > index && b.kind === 'h3'),
          ),
        },
      ]
    : [],
);
export default function Methods() {
  const corpus = useRead(reports.corpus);
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Methods',
          ...headerItems(() => [
            shareHeaderItem({ path: '/methods', title: 'Methods' }),
          ]),
        }}
      />
      <Screen testID="methods-screen">
        <Heading level={1} testID="methods-1">
          {copy[1]!.text}
        </Heading>
        {sections.map(({ title, index, body }) => {
          if (title === 'Licence, code and corrections')
            return (
              <LinkRow
                key={title}
                title="Sources and licences"
                icon="checkmark.seal"
                accent="leads"
                onPress={() => router.push('/account/sources')}
                testID="methods-sources"
              />
            );
          const texts = body.map((block) =>
            block.text.startsWith('State coverage windows differ by parliament')
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
              : block.text,
          );
          const notes =
            title === 'Known limitations'
              ? [...texts, ...(corpus.record?.data.known_defects ?? [])]
              : texts;
          const folded =
            title === 'Known limitations' || title === 'Corrections';
          return (
            <Section
              key={title}
              title={title}
              headingTestID={`methods-${index}`}
              icon="text.book.closed"
              accent="bills"
              info={folded ? { title, notes } : undefined}
            >
              {folded ? null : (
                <Group>
                  {texts.map((text, i) => (
                    <Text key={i} wordSafe testID={`methods-${index + i + 1}`}>
                      {text}
                    </Text>
                  ))}
                </Group>
              )}
            </Section>
          );
        })}
      </Screen>
    </>
  );
}
