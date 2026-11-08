import { InsetGroup } from '../../design/layout';
import { useSheetPayload } from '../../navigation/sheets';
import { MissingPayload, SheetFrame } from './frame';
import { OriginalsGroup, Paragraphs } from './SourceSheet';

export default function MachineNoteSheet() {
  const payload = useSheetPayload('machine');
  const testID = payload?.testID
    ? `${payload.testID}-sheet`
    : 'machine-note-sheet';
  return (
    <SheetFrame title="Machine-written" short testID={testID}>
      {payload ? (
        <>
          <InsetGroup>
            <Paragraphs paragraphs={payload.note.body} />
          </InsetGroup>
          {payload.note.sources ? (
            <OriginalsGroup
              details={payload.note.sources}
              overModal={payload.overModal}
              testID={testID}
              header="Originals"
            />
          ) : null}
        </>
      ) : (
        <MissingPayload />
      )}
    </SheetFrame>
  );
}
