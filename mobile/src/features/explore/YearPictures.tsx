import { EmptyState, Group, Text } from '../../design/primitives';
import { useRead, ReadState } from '../reports/parts';
import { explore } from './runtime';
import { Picture } from './Picture';
export function YearPictures({ year }: { year: number }) {
  const read = useRead(explore.pictures);
  return (
    <ReadState
      read={read}
      citation="OPAX year photograph manifest"
      testID="tm-photo-manifest"
    >
      {(manifest) => {
        const photos = manifest[String(year)] ?? [];
        return (
          <Group>
            <Text wordSafe variant="metadata">
              {photos.length} photographs
            </Text>
            {photos.length ? (
              photos.map((p) => (
                <Group key={p.file}>
                  <Picture file={p.file} ratio={p.width / p.height} />
                  <Text wordSafe>{p.caption}</Text>
                </Group>
              ))
            ) : (
              <EmptyState message="No photographs are available for this year." />
            )}
          </Group>
        );
      }}
    </ReadState>
  );
}
