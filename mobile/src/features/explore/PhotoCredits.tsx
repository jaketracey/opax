import { useState } from 'react';
import {
  Section,
  Field,
  Text,
  RowList,
  Group,
  Disclosure,
  SourceLink,
} from '../../design/primitives';
import { useRead, ReadState } from '../reports/parts';
import { explore } from './runtime';
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
                  <SourceLink
                    citation="Wikimedia Commons"
                    url={p.source_url}
                    kind="record"
                  />
                  {p.licence_url ? (
                    <SourceLink
                      citation={p.licence}
                      url={p.licence_url}
                      label="Licence"
                      kind="record"
                    />
                  ) : null}
                </Group>
              ))}
            </RowList>
          </Group>
        );
      }}
    </ReadState>
  );
}
