import { LinkRow } from '../design/primitives';

/** A wrapping native navigation row; all visible record text is in its label. */
export function RecordRow({
  title,
  detail,
  onPress,
  testID,
}: {
  title: string;
  detail?: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <LinkRow title={title} detail={detail} onPress={onPress} testID={testID} />
  );
}
