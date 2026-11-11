import { Stack } from 'expo-router';
import { detailBackOptions, screen, sheetOptions, untitled } from './screen';
import { pendingHeaderOptions } from '../chrome';

export function peopleScreens() {
  return [
    screen('person/[slug]', '', untitled),
    screen('person/[slug]/votes', 'Voting record'),
    screen('person/[slug]/speeches', 'Speeches'),
    screen('person/[slug]/interests', 'Declared interests'),
    screen('party/[slug]', '', untitled),
    screen('party-sources', 'Largest sources by year'),
    screen('declarations', 'Just declared'),
    screen('expense-glossary', 'Expense categories', sheetOptions),
    <Stack.Screen
      key="directory"
      name="directory"
      options={({ route, navigation }) => {
        const kind =
          (route.params as { kind?: string } | undefined)?.kind ?? 'person';
        const title =
          (
            {
              person: 'Parliamentarians',
              party: 'Parties',
              electorate: 'Electorates',
            } as Record<string, string>
          )[kind] ?? 'Parliamentarians';
        return {
          title,
          headerTitle: kind === 'person' ? 'People' : title,
          headerLargeTitleEnabled: false,
          ...detailBackOptions(navigation, route.key, 'directory'),
          ...pendingHeaderOptions('directory'),
        };
      }}
    />,
  ];
}
