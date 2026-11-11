import { associatedLine, type donorAssociated } from '../api/associated';
import { openSource } from '../navigation/external';
import { Text } from './text';

/** A quiet, wrapping register attribution, separate from the entity's link. */
export function AssociatedEntityLabel({
  associated,
  testID,
}: {
  associated: ReturnType<typeof donorAssociated>;
  testID?: string;
}) {
  if (!associated) return null;
  const label = associatedLine(associated)!;
  return (
    <Text
      wordSafe
      variant="footnote"
      tone="inkSoft"
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens the AEC register of associated entities"
      onPress={() =>
        void openSource(associated.url, 'AEC register of associated entities')
      }
      testID={testID}
    >
      {label}
    </Text>
  );
}
