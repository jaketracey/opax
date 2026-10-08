import { LinkRow } from '../design/primitives';
import { ownsRowPadding } from '../design/row-padding';
import type { Accent } from '../design/tokens';

/** A wrapping native navigation row; all visible record text is in its label. */
export function RecordRow({
  title,
  detail,
  onPress,
  testID,
  accent,
  selected,
  highlighted,
}: {
  title: string;
  detail?: string;
  onPress: () => void;
  testID?: string;
  /** The selected wash's category in an iPad split list. */
  accent?: Accent;
  /** In an iPad split list (see LinkRow); undefined everywhere else. */
  selected?: boolean;
  highlighted?: boolean;
}) {
  return (
    <LinkRow
      title={title}
      detail={detail}
      onPress={onPress}
      testID={testID}
      accent={accent}
      selected={selected}
      highlighted={highlighted}
    />
  );
}

ownsRowPadding(RecordRow);
