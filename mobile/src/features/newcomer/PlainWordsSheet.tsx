import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Disclosure } from '../../design/disclosure';
import { InsetGroup } from '../../design/layout';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { SheetFrame } from '../sheets/frame';
import { plainWordsCopy, termOrder, terms, type TermId } from './terms';

/**
 * Plain words: every term in one sheet, each a disclosure row that opens its
 * short answer. Reached from any term's sheet ("All plain words"), from
 * Account, and from Search's browse list. Opened at a term, that row starts
 * open.
 */
export default function PlainWordsSheet() {
  const { term } = useLocalSearchParams<{ term?: TermId }>();
  return (
    <SheetFrame title={plainWordsCopy.title} testID="plain-words-sheet">
      <Text wordSafe variant="body" tone="inkSoft">
        {plainWordsCopy.lead}
      </Text>
      <InsetGroup testID="plain-words-group">
        {termOrder.map((id) => (
          <Disclosure
            key={id}
            label={terms[id].word}
            defaultOpen={id === term}
            testID={`plain-word-${id}`}
          >
            <View style={styles.body}>
              {terms[id].body.map((p, i) => (
                <Text key={i} wordSafe variant="body">
                  {p}
                </Text>
              ))}
            </View>
          </Disclosure>
        ))}
      </InsetGroup>
      <Text wordSafe variant="footnote" tone="inkSoft">
        {plainWordsCopy.draft}
      </Text>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  body: { gap: rhythm.tight, paddingBottom: rhythm.row },
});
