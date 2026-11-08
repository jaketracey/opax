import type { NativeStackHeaderItem } from 'expo-router';
import { closeSheetItem, headerItems } from '../../navigation/chrome';
import { useSheetPayload } from '../../navigation/sheets';
import { MissingPayload, SheetFrame } from './frame';

/** Ask fills the content and navigation slots in wave 4. */
export function citationBar(
  citation: NonNullable<
    ReturnType<typeof useSheetPayload<'citation'>>
  >['citation'],
) {
  const previous: NativeStackHeaderItem = {
    type: 'button',
    label: 'Previous source',
    icon: { type: 'sfSymbol', name: 'chevron.up' },
    onPress: () => citation.previous?.(),
    disabled: !citation.previous,
  };
  const next: NativeStackHeaderItem = {
    type: 'button',
    label: 'Next source',
    icon: { type: 'sfSymbol', name: 'chevron.down' },
    onPress: () => citation.next?.(),
    disabled: !citation.next,
  };
  // Expo normalises native right items to visual order.
  return {
    ...headerItems(() => [
      ...(citation.menu ? [citation.menu] : []),
      closeSheetItem(),
    ]),
    unstable_headerLeftItems: () =>
      citation.previous || citation.next ? [previous, next] : [],
  };
}
export default function CitationSheet() {
  const payload = useSheetPayload('citation');
  return (
    <SheetFrame
      title={
        payload?.citation.number
          ? `Citation ${payload.citation.number}`
          : 'Citation'
      }
      citation
      testID={payload?.testID ?? 'citation-sheet'}
      options={payload ? citationBar(payload.citation) : undefined}
    >
      {payload ? payload.citation.content : <MissingPayload />}
    </SheetFrame>
  );
}
