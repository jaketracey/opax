import { Platform, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import {
  Disclosure,
  InlineError,
  InsetGroup,
  Screen,
  Text,
  ValueRow,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { sourcesCopy as text } from './parts';

export interface FontNotice {
  name: string;
  notice: string;
}
/** The bundled fonts' OFL notices, from the build. */
export function fontList(): FontNotice[] {
  const raw: unknown = Constants.expoConfig?.extra?.fontAcknowledgements;
  return Array.isArray(raw)
    ? raw.filter(
        (f): f is FontNotice =>
          typeof f?.name === 'string' && typeof f?.notice === 'string',
      )
    : [];
}
const fontName = (name: string) =>
  name === 'PublicSans' ? 'Public Sans' : name;

/**
 * Fonts (account.md 4.6): one group per bundled family, its licence as a
 * value and the full notice behind one disclosure, the one place a long
 * legal text sits behind a fold.
 */
export default function FontsList() {
  const fonts = fontList();
  return (
    <Screen grouped testID="sources-fonts-screen">
      {fonts.length ? (
        fonts.map((font) => (
          <InsetGroup
            key={font.name}
            footer={
              font.name === 'PublicSans' && Platform.OS === 'ios'
                ? text.androidFont
                : undefined
            }
            testID={`sources-font-${font.name}`}
          >
            <View style={styles.title}>
              <Text wordSafe variant="strong">
                {fontName(font.name)}
              </Text>
            </View>
            <ValueRow label={text.licence} value={text.fontLicence} />
            <Disclosure
              label={text.fontText}
              testID={`sources-font-${font.name}-text`}
            >
              {() => (
                <View style={styles.notice}>
                  {font.notice
                    .split(/\n\s*\n/u)
                    .filter((paragraph) => paragraph.trim())
                    .map((paragraph, index) => (
                      <Text
                        key={index}
                        wordSafe
                        selectable
                        variant="footnote"
                        testID={
                          index === 0
                            ? `sources-notice-${font.name}`
                            : undefined
                        }
                      >
                        {paragraph}
                      </Text>
                    ))}
                </View>
              )}
            </Disclosure>
          </InsetGroup>
        ))
      ) : (
        <InlineError
          subject={text.fonts}
          message={text.fontsError}
          testID="sources-fonts-error"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { paddingVertical: rhythm.row },
  notice: { gap: rhythm.tight, paddingBottom: rhythm.row },
});
