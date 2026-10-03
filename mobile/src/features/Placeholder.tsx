import { Divider, Screen, Text } from '../design/primitives';
export function Placeholder({
  title,
  message,
  id,
}: {
  title: string;
  message: string;
  id: string;
}) {
  return (
    <Screen title={title} testID={id}>
      <Text>{message}</Text>
      <Divider />
      <Text variant="fine" testID={`${id}-footer`}>
        OPAX is independent and non-partisan. It is not a government app.
      </Text>
    </Screen>
  );
}
