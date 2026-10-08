import { Stack } from 'expo-router';
import { useState } from 'react';
import { Button, InfoSheet } from '../../design/primitives';
import { headerItems } from '../../navigation/chrome';
import { shareHeaderItem } from '../../navigation/share';
export function ExploreHeader({
  title,
  game,
}: {
  title: string;
  game?: string;
}) {
  return (
    <Stack.Screen
      options={{
        title,
        ...headerItems(() => [
          shareHeaderItem({
            title,
            path: game ? `/explore?game=${game}` : '/explore',
          }),
        ]),
      }}
    />
  );
}
export function MachinePill({ note }: { note: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        label="Machine-written"
        size="compact"
        onPress={() => setOpen(true)}
        testID="explore-machine-pill"
      />
      <InfoSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Machine-written"
        notes={[note]}
        testID="explore-machine-note"
      />
    </>
  );
}
