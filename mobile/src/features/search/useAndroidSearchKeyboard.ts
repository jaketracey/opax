import { useContext, useEffect, useRef, type RefObject } from 'react';
import { Keyboard, Platform, type TextInput } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';

/** IME Back dismisses the keyboard first, then releases search focus. */
export function useAndroidSearchKeyboard(
  input: RefObject<TextInput | null>,
  onDismiss: () => void,
) {
  const latest = useRef(onDismiss);
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    latest.current = onDismiss;
  });
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let hide: ReturnType<typeof Keyboard.addListener> | null = null;
    const focus = () => {
      hide?.remove();
      hide = Keyboard.addListener('keyboardDidHide', () => {
        if (!input.current?.isFocused()) return;
        input.current.blur();
        latest.current();
      });
    };
    const blur = () => {
      hide?.remove();
      hide = null;
      input.current?.blur();
    };
    if (!navigation || navigation.isFocused()) focus();
    const onFocus = navigation?.addListener('focus', focus);
    const onBlur = navigation?.addListener('blur', blur);
    return () => {
      onFocus?.();
      onBlur?.();
      blur();
    };
  }, [input, navigation]);
}
