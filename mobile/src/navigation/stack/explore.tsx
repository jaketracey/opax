import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { detailBackOptions, screen, sheetOptions, untitled } from './screen';
import { closeSheetItem, headerItems, pendingHeaderOptions } from '../chrome';
import { frontPageQuestion } from '../../features/explore/quiz/data';

const names: Record<string, string> = {
  quiz: 'The record quiz',
  tm: 'Time machine',
  tide: 'The tide',
  matrix: 'Who owns which debate',
  wd: 'Words per dollar',
};
/**
 * A tool's stack title, which is also the next screen's back label. "Today's
 * question" only when `q` names a question in the front-page deck; an unknown
 * `q` opens the quiz intro, so it reads "The record quiz".
 */
export function exploreToolTitle(
  params: { tool?: string; q?: string; name?: string } | undefined,
): string {
  if (params?.name) return params.name;
  if (params?.tool === 'quiz' && frontPageQuestion(params.q))
    return 'Today’s question';
  return names[params?.tool ?? ''] ?? 'Tool';
}
export function exploreScreens() {
  return [
    screen('explore/index', 'Quizzes and tools'),
    <Stack.Screen
      key="explore/[tool]"
      name="explore/[tool]"
      options={({ route, navigation }) => {
        const params = route.params as
          | { tool?: string; q?: string; name?: string }
          | undefined;
        return {
          title: exploreToolTitle(params),
          ...untitled,
          headerLargeTitleEnabled: false,
          headerTitleAlign: Platform.OS === 'android' ? 'left' : 'center',
          ...detailBackOptions(navigation, route.key, 'explore/[tool]'),
          ...pendingHeaderOptions('explore/[tool]'),
        };
      }}
    />,
    screen('explore/photo', 'Photograph', {
      presentation: 'fullScreenModal',
      ...headerItems(() => [closeSheetItem()]),
      ...(Platform.OS === 'android'
        ? { statusBarStyle: 'light' as const }
        : {}),
    }),
    screen('explore/tide-table', 'The tide', {
      ...sheetOptions,
      sheetAllowedDetents: [1],
    }),
    screen('explore/years', 'Year', sheetOptions),
  ];
}
