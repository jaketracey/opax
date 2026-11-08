import { Stack } from 'expo-router';
import { screen, sheetOptions } from './screen';
import { closeSheetItem, headerItems } from '../chrome';

const names: Record<string, string> = {
  quiz: 'The record quiz',
  tm: 'Time machine',
  tide: 'The tide',
  matrix: 'Who owns which debate',
  wd: 'Words per dollar',
};
export function exploreScreens() {
  return [
    screen('explore/index', 'Quizzes and tools'),
    <Stack.Screen
      key="explore/[tool]"
      name="explore/[tool]"
      options={({ route }) => {
        const params = route.params as
          | { tool?: string; q?: string; name?: string }
          | undefined;
        return {
          title:
            params?.name ||
            (params?.tool === 'quiz' && params.q
              ? "Today's question"
              : (names[params?.tool ?? ''] ?? 'Tool')),
          headerLargeTitleEnabled: false,
        };
      }}
    />,
    screen('explore/photo', 'Photograph', {
      presentation: 'fullScreenModal',
      ...headerItems(() => [closeSheetItem()]),
    }),
    screen('explore/tide-table', 'The tide', {
      ...sheetOptions,
      sheetAllowedDetents: [1],
    }),
    screen('explore/years', 'Year', sheetOptions),
  ];
}
