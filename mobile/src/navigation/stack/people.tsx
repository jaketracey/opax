import { Stack } from 'expo-router';
import { screen, sheetOptions } from './screen';

export function peopleScreens() {
  return [
    screen('person/[slug]', 'Parliamentarian'),
    screen('person/[slug]/votes', 'Voting record'),
    screen('person/[slug]/speeches', 'Speeches'),
    screen('person/[slug]/interests', 'Declared interests'),
    screen('party/[slug]', 'Party'),
    screen('party-sources', 'Largest sources by year'),
    screen('declarations', 'Just declared'),
    screen('expense-glossary', 'Expense categories', sheetOptions),
    <Stack.Screen
      key="directory"
      name="directory"
      options={({ route }) => ({
        title:
          (
            {
              person: 'Parliamentarians',
              party: 'Parties',
              electorate: 'Electorates',
            } as Record<string, string>
          )[
            (route.params as { kind?: string } | undefined)?.kind ?? 'person'
          ] ?? 'Parliamentarians',
        headerLargeTitleEnabled: false,
      })}
    />,
  ];
}
