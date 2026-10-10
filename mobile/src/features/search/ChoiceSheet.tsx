import { Modal, Platform, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '../../design/accessibility';
import { useKeyCommand } from '../../design/keyboard';
import { SheetBody } from '../../design/source';
import { rhythm } from '../../design/tokens';
import { AndroidBottomSheet } from '../../navigation/AndroidSheet';
import { Choices } from './FiltersSheet';

/**
 * One choice from a short list, in a page sheet: plain rows with a check
 * mark beside the current one, and Done in the bar. Choosing a row applies
 * it and closes the sheet. The search kind and the sort use it. On Android
 * a short list rises in a bottom sheet rather than a full-screen modal; a
 * list long enough to need its find field keeps the full screen.
 */
export function ChoiceSheet({
  title,
  choices,
  value,
  onChange,
  onClose,
  testID,
}: {
  title: string;
  choices: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  /** `records-sort` gives `records-sort-option-newest` and `records-sort-sheet`. */
  testID: string;
}) {
  const reduced = useReduceMotion();
  useKeyCommand('list-escape', onClose, true);
  const list = (
    <Choices
      bare
      label={title}
      choices={choices}
      value={value}
      onChange={onChange}
      onClose={onClose}
      testID={testID}
    />
  );
  if (Platform.OS === 'android' && choices.length <= 12)
    return (
      <AndroidBottomSheet
        title={title}
        onClose={onClose}
        testID={`${testID}-sheet`}
      >
        <View style={styles.list}>{list}</View>
      </AndroidBottomSheet>
    );
  return (
    <Modal
      visible
      presentationStyle="pageSheet"
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <SheetBody title={title} onClose={onClose} testID={`${testID}-sheet`}>
        {list}
      </SheetBody>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: rhythm.screen },
});
