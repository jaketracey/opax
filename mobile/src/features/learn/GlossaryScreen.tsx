import { useMemo } from 'react';
import { Platform } from 'react-native';
import { InsetGroup, Screen } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { AndroidReadingHeader } from '../../navigation/AndroidReadingHeader';
import { RouteOptions } from '../../navigation/preview';
import { matches, NoResults, paperBar, useBarSearch } from '../sources/parts';
import { learnCopy } from './copy';
import {
  foldTerm,
  glossaryTerm,
  termsAtoZ,
  termTitle,
  type TermId,
} from './glossary';
import { openTerm } from './open-term';

export const glossaryCopy = {
  search: 'Search the glossary',
  noResults: 'Try another word, or browse the list.',
} as const;

/** Terms grouped under their first letter, A to Z. */
export function glossaryLetters(ids: readonly TermId[]) {
  const letters: { letter: string; ids: TermId[] }[] = [];
  for (const id of ids) {
    const letter = foldTerm(termTitle(id)).charAt(0).toUpperCase();
    const last = letters[letters.length - 1];
    if (last?.letter === letter) last.ids.push(id);
    else letters.push({ letter, ids: [id] });
  }
  return letters;
}

/**
 * `/learn/glossary`: the A to Z glossary (README 8.1). Every term the guide
 * explains, under its letter, with its one line; the bar search finds a
 * term by its name or its words. A row opens the term's answer sheet.
 */
export default function Glossary() {
  const search = useBarSearch(glossaryCopy.search);
  const letters = useMemo(
    () =>
      glossaryLetters(
        termsAtoZ.filter((id) => {
          const term = glossaryTerm(id);
          return matches(search.query, [term.word, term.short, term.more]);
        }),
      ),
    [search.query],
  );
  return (
    <>
      <RouteOptions
        options={{
          title: learnCopy.glossary,
          headerSearchBarOptions: search.options,
          ...paperBar,
          ...(Platform.OS === 'android'
            ? { header: AndroidReadingHeader }
            : {}),
        }}
      />
      <Screen grouped testID="learn-glossary">
        {letters.length ? (
          letters.map(({ letter, ids }) => (
            <InsetGroup
              key={letter}
              header={letter}
              testID={`learn-glossary-${letter}`}
            >
              {ids.map((id) => (
                <LinkRow
                  key={id}
                  title={termTitle(id)}
                  secondary={glossaryTerm(id).short}
                  onPress={() => openTerm(id)}
                  testID={`learn-glossary-term-${id}`}
                />
              ))}
            </InsetGroup>
          ))
        ) : (
          <NoResults
            query={search.query}
            body={glossaryCopy.noResults}
            testID="learn-glossary-empty"
          />
        )}
      </Screen>
    </>
  );
}
