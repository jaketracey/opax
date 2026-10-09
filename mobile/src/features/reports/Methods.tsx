import { headerItems } from '../../navigation/chrome';
import { Stack, router } from 'expo-router';
import { reports } from '../../api/runtime';
import {
  Disclosure,
  Group,
  Heading,
  LinkRow,
  RowList,
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
              <Section
                key={title}
                title={title}
                headingTestID={`methods-${index}`}
              >
                <RowList>
                  <LinkRow
                    title="Sources and licences"
                    onPress={() => router.push('/account/sources')}
                    testID="methods-sources"
                  />
                </RowList>
              </Section>
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
          // Long lists of caveats fold behind one disclosure, in full.
          return (
            <Section
              key={title}
              title={title}
              headingTestID={`methods-${index}`}
            >
              {folded ? (
                <Disclosure
                  label={
                    title === 'Corrections'
                      ? notes.length === 1
                        ? 'Read the correction'
                        : `Read the ${notes.length} corrections`
                      : `Read the ${notes.length} limitations`
                  }
                  testID={`methods-${index}-fold`}
                >
                  {() => (
                    <Group>
                      {notes.map((note, i) => (
                        <Text key={i} wordSafe>
                          {note}
                        </Text>
                      ))}
                    </Group>
                  )}
                </Disclosure>
              ) : (
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
