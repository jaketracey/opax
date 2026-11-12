import type { RefObject } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from '../../design/icon';
import { symbols } from '../../design/symbols';
import { colors, rhythm, textStyles } from '../../design/tokens';

/** Material's tonal search field; its IME Search key is the submit action. */
export function SearchField({
  inputRef,
  value,
  placeholder,
  onChangeText,
  onSubmitEditing,
  testID,
}: {
  inputRef: RefObject<TextInput | null>;
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  testID: string;
}) {
  return (
    <View style={styles.field}>
      <Icon name={symbols.search} size={24} tone="inkSoft" maxScale={1} />
      <TextInput
        ref={inputRef}
        value={value}
        accessibilityLabel="Search"
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
        submitBehavior="blurAndSubmit"
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        allowFontScaling
        style={styles.input}
        testID={testID}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => {
            onChangeText('');
            inputRef.current?.focus();
          }}
          android_ripple={{ color: colors.dividerSubtle, borderless: true }}
          style={styles.clear}
          testID={`${testID}-clear`}
        >
          <Icon name={symbols.close} size={24} tone="inkSoft" maxScale={1} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: 56,
    paddingLeft: rhythm.block,
    paddingRight: rhythm.tight,
    borderRadius: 28,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
  input: {
    ...textStyles.body,
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    paddingVertical: rhythm.block,
    color: colors.ink,
  },
  clear: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
