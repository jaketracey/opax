import { Modal } from 'react-native';
import { useReduceMotion } from '../../design/accessibility';
import { useKeyCommand } from '../../design/keyboard';
import { SheetBody } from '../../design/source';
import { Choices } from './FiltersSheet';

/**
 * One choice from a short list, in a page sheet: plain rows with a check
 * mark beside the current one, and Done in the bar. Choosing a row applies
 * it and closes the sheet. The search kind and the sort use it.
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
  return (
    <Modal
      visible
      presentationStyle="pageSheet"
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <SheetBody title={title} onClose={onClose} testID={`${testID}-sheet`}>
        <Choices
          bare
          label={title}
          choices={choices}
          value={value}
          onChange={onChange}
          onClose={onClose}
          testID={testID}
        />
      </SheetBody>
    </Modal>
  );
}
