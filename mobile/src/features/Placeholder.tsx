import { Group, Screen, Section, Text } from '../design/primitives';
export function Placeholder({ message, id }: { message: string; id: string }) {
  return (
    <Screen testID={id}>
      <Group>
        <Text variant="lede" testID={`${id}-message`}>
          {message}
        </Text>
      </Group>
      <Section>
        <Text variant="fine" testID={`${id}-footer`}>
          OPAX is independent and non-partisan. It is not a government app.
        </Text>
      </Section>
    </Screen>
  );
}
