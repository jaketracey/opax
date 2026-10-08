import { Stack } from 'expo-router';
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
