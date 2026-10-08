import { LinkRow } from '../design/primitives';
import { ownsRowPadding } from '../design/row-padding';

/** A wrapping native navigation row; all visible record text is in its label. */
export function RecordRow({
  title,
  detail,
  onPress,
  testID,
  path,
}: {
  title: string;
  detail?: string;
  onPress: () => void;
  testID?: string;
  /** Canonical public web path, used only by an explicit iPad drag. */
  path?: string;
}) {
  return (
    <LinkRow
      title={title}
      detail={detail}
      onPress={onPress}
      testID={testID}
      dragPath={path}
    />
  );
}

ownsRowPadding(RecordRow);
