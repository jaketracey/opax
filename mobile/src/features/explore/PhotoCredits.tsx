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
import pictures from './pictures.json';
const photos = Object.values(pictures).flat();
export function ExplorePhotoCredits() {
  const [query, setQuery] = useState('');
  const matches = photos.filter((p) =>
    `${p.caption} ${p.author} ${p.date}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Section title="Time machine photographs">
      <Disclosure label={`Photo credits (${photos.length})`}>
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
      </Disclosure>
    </Section>
  );
}
