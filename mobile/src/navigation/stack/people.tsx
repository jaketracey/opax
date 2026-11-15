import { Stack } from 'expo-router';
import { detailBackOptions, screen, sheetOptions, untitled } from './screen';
import {
  closeSheetItem,
  headerItems,
  pendingHeaderOptions,
  solidRailBar,
  type UnderBar,
} from '../chrome';
import { sheetListOptions } from '../sheet-lists';

/**
 * `underBar`: the tab stack's pushed pages run under a clear bar (the closed
 * Duo). The directory and Just declared keep a solid one there: a search
 * field holds their title band open, and React Native pins their sticky
 * section headers at the scroll view's top edge, which a clear bar covers.
 * On other iOS 26 layouts they are laid out below their bar for the pinned
 * headers alone, and that bar is the page's ground with no hairline.
 */
export function peopleScreens(underBar: UnderBar = false) {
  return [
    screen('person/[slug]', '', untitled),
    screen('person/[slug]/votes', 'Voting record'),
    screen('person/[slug]/speeches', 'Speeches'),
    screen('person/[slug]/interests', 'Declared interests'),
    screen('party/[slug]', '', untitled),
    screen('party-sources', 'Largest sources by year'),
    screen('declarations', 'Just declared', solidRailBar(underBar)),
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
        return sheetListOptions(
          {
            title,
            headerTitle: kind === 'person' ? 'People' : title,
            headerLargeTitleEnabled: false,
            ...detailBackOptions(navigation, route.key, 'directory'),
            ...pendingHeaderOptions('directory'),
            ...solidRailBar(underBar),
            ...(navigation?.getState?.()?.index === 0
              ? headerItems(() => [closeSheetItem()])
              : {}),
          },
          'directory',
          navigation?.getState?.()?.index,
        );
      }}
    />,
  ];
}
