import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { Keyboard, Platform, type TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** IME Back dismisses the keyboard first, then releases search focus. */
export function useAndroidSearchKeyboard(
  input: RefObject<TextInput | null>,
  onDismiss: () => void,
) {
  const latest = useRef(onDismiss);
  useEffect(() => {
    latest.current = onDismiss;
  });
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const hide = Keyboard.addListener('keyboardDidHide', () => {
        if (!input.current?.isFocused()) return;
        input.current.blur();
        latest.current();
      });
      return () => {
        hide.remove();
        input.current?.blur();
      };
    }, [input]),
  );
}
