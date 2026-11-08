import { useLocalSearchParams } from 'expo-router';
import { copy } from '../../design/copy';
import { InsetGroup } from '../../design/layout';
import { ValueRow } from '../../design/rows';
import { SourceLine } from '../../design/source';
import { useSheetPayload } from '../../navigation/sheets';
import { MissingPayload, SheetFrame } from './frame';
import { OriginalsGroup, Paragraphs } from './SourceSheet';

export default function RuleSheet() {
  const { variant } = useLocalSearchParams<{ variant?: string }>();
  const rule = useSheetPayload('rule');
  const table = useSheetPayload('table');
  const payload = variant === 'table' ? table : rule;
  const testID = payload?.testID ? `${payload.testID}-sheet` : 'rule-sheet';
  return (
    <SheetFrame
      title={payload?.title ?? copy.howChosen}
      short={variant !== 'table'}
      testID={testID}
    >
      {!payload ? (
        <MissingPayload />
      ) : payload.kind === 'table' ? (
        <>
          <InsetGroup>
            {payload.rows.map((row, index) => (
              <ValueRow key={index} {...row} />
            ))}
          </InsetGroup>
          {payload.sources ? <SourceLine {...payload.sources} /> : null}
        </>
      ) : (
        <>
          <InsetGroup>
            <Paragraphs paragraphs={[payload.rule]} />
          </InsetGroup>
          {payload.sources ? (
            <OriginalsGroup
              details={payload.sources}
              overModal={payload.overModal}
              testID={testID}
              header="Originals"
            />
          ) : null}
          {payload.extra}
        </>
      )}
    </SheetFrame>
  );
}
