import { useState } from 'react';
import {
  Section,
  Field,
  Text,
  RowList,
  Group,
  Disclosure,
  SourceLine,
  type SourceOriginal,
} from '../../design/primitives';
import { useRead, ReadState } from '../reports/parts';
import { explore } from './runtime';
import type { YearPicture } from './pictures';

/**
 * A photograph's originals: its Wikimedia Commons page, then its licence.
 * Creative Commons still publishes some licence links as http; they are
 * served over https.
 */
export function photoOriginals(p: YearPicture): SourceOriginal[] {
  return [
    { label: 'Photo source', record: 'Wikimedia Commons', url: p.source_url },
    ...(p.licence_url
      ? [
          {
            label: 'Licence',
            record: p.licence,
            url: p.licence_url.replace(
              /^http:\/\/creativecommons\.org\//,
              'https://creativecommons.org/',
            ),
          },
        ]
      : []),
  ];
}
export function ExplorePhotoCredits() {
  return (
    <Section title="Time machine photographs">
      <Disclosure label="Photo credits" testID="explore-photo-credits">
        {() => <PhotoCreditsList />}
      </Disclosure>
    </Section>
  );
}
function PhotoCreditsList() {
  const [query, setQuery] = useState('');
  const read = useRead(explore.pictures);
  return (
    <ReadState
      read={read}
      citation="OPAX year photograph manifest"
      testID="explore-photo-credits-manifest"
    >
      {(manifest) => {
        const matches = Object.values(manifest)
          .flat()
          .filter((p) =>
            `${p.caption} ${p.author} ${p.date ?? ''}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          );
        return (
          <Group>
            <Field
              label="Find a photograph"
              value={query}
              onChangeText={setQuery}
            />
            <Text wordSafe variant="metadata">
              {matches.length} photographs
            </Text>
            <RowList>
              {matches.map((p) => (
                <Group key={p.file}>
                  <Text wordSafe variant="strong">
                    {p.caption}
                  </Text>
                  <Text wordSafe>
                    {p.author} · {p.licence}
                  </Text>
                  <Text wordSafe variant="metadata">
                    {p.credit}
                  </Text>
                  {/* As a portrait credit reads on the same screen: one
                      line naming the photo source and licence, both
                      opening from its sheet. */}
                  <SourceLine
                    label={
                      p.licence_url
                        ? 'Photo source and licence'
                        : 'Photo source'
                    }
                    title="About this photograph"
                    citation="Wikimedia Commons"
                    originals={photoOriginals(p)}
                    testID={`explore-photo-source-${p.file}`}
                  />
                </Group>
              ))}
            </RowList>
          </Group>
        );
      }}
    </ReadState>
  );
}
