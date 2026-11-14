import { router, useLocalSearchParams } from 'expo-router';
import { InsetGroup } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { MissingPayload, SheetFrame } from '../sheets/frame';
import { openOriginal, Paragraphs } from '../sheets/SourceSheet';
import { learnCopy } from './copy';
import { glossaryTerm, isTermId, termTitle } from './glossary';
import { glossaryRoute } from './routes';

/**
 * `/term?id=`: one glossary term's answer (README 8.2, B's sheet). The term
 * as the title; the guide's one line and its longer answer; "See it in OPAX"
 * where the guide names a real record; then the A to Z glossary. Every word
 * comes from content/learn/glossary.json.
 *
 * Opened above the welcome, the electorate step or Account (`over=1`), the
 * sheet can't push a tab page beneath: the record opens in the browser
 * sheet, and the glossary row is left out.
 */
export default function TermSheet() {
  const { id, over } = useLocalSearchParams<{ id?: string; over?: string }>();
  if (!isTermId(id))
    return (
      <SheetFrame title={learnCopy.name} short compact testID="term-sheet">
        <MissingPayload />
      </SheetFrame>
    );
  const term = glossaryTerm(id);
  const above = over === '1';
  const example = term.example;
  return (
    <SheetFrame title={termTitle(id)} short compact testID={`term-${id}-sheet`}>
      <InsetGroup>
        <Paragraphs paragraphs={[term.short, term.more]} />
      </InsetGroup>
      {example ? (
        <InsetGroup header={learnCopy.seeIt}>
          <LinkRow
            title={example.label}
            titleLines={0}
            onPress={() =>
              openOriginal({ url: example.url, label: example.label }, above)
            }
            testID={`term-${id}-example`}
          />
        </InsetGroup>
      ) : null}
      {above ? null : (
        <InsetGroup>
          <LinkRow
            title={learnCopy.glossary}
            symbol="books.vertical"
            onPress={() => {
              router.back();
              router.push(glossaryRoute);
            }}
            testID={`term-${id}-glossary`}
          />
        </InsetGroup>
      )}
    </SheetFrame>
  );
}
