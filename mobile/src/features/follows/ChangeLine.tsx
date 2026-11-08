import { Text } from '../../design/text';
import { changeAccessibilityLabel, changeText, type Change } from './changes';
export interface ChangeLineProps {
  change: Change;
  testID?: string;
}
/** SF action and the record's own date. Titles belong to the page rows. */
export function ChangeLine({ change, testID }: ChangeLineProps) {
  return (
    <Text
      variant="secondary"
      testID={testID}
      accessibilityLabel={changeAccessibilityLabel(change)}
    >
      {changeText(change)}
    </Text>
  );
}
