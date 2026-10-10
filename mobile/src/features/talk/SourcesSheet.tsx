import { Modal } from 'react-native';
import { LinkRow, RowList, useReduceMotion } from '../../design/primitives';
import { SheetBody } from '../../design/source';
import { webPageUrl } from '../../navigation/external';
import type { VoiceSource } from '../../voice';
import { recordDestination } from './sources';
import { useKeyCommand } from '../../design/keyboard';

/** Sources a call can open: validated OPAX record paths only. */
export const openableSources = (sources: readonly VoiceSource[]) =>
  sources.filter((source) => webPageUrl(source.path));

/**
 * The records behind the call's answers, in a native sheet over the call
 * (the source sheet's bar and rows). A sheet, not a route: leaving Talk's
 * route would end the call. A record the app draws opens in the call (a
 * chevron); one on opax.com.au waits for the call to end (Safari).
 */
export function SourcesSheet({
  visible,
  sources,
  active,
  onOpen,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  sources: readonly VoiceSource[];
  active: boolean;
  onOpen: (source: VoiceSource) => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const reduced = useReduceMotion();
  useKeyCommand('list-escape', onClose, visible);
  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <SheetBody title="Sources" onClose={onClose} testID="talk-sources-sheet">
        <RowList>
          {openableSources(sources).map((source, index) => {
            const native = recordDestination(source.path) !== null;
            return (
              <LinkRow
                key={source.path}
                title={source.title}
                external={!native}
                testID={`talk-source-${index}`}
                accessibilityLabel={source.title}
                accessibilityHint={
                  native
                    ? active
                      ? 'Opens the record within the conversation'
                      : 'Opens the record'
                    : active
                      ? 'Opens on opax.com.au after the conversation'
                      : 'Opens on opax.com.au'
                }
                onPress={() => onOpen(source)}
              />
            );
          })}
        </RowList>
      </SheetBody>
    </Modal>
  );
}
