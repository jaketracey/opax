// a11y-static fixture: every `expect` line must be reported, nothing else.
import { StyleSheet, Text } from 'react-native';

export function RawFontSizeFixture() {
  const fontSize = 18;
  return (
    <>
      <Text style={styles.title}>Title</Text>
      <Text style={{ fontSize }}>Shorthand</Text>
      {/* expect-above: raw-font-size */}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, lineHeight: 28 }, // expect: raw-font-size
});
