import {
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  useCallback,
} from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import type { SearchBarCommands, SearchBarProps } from 'react-native-screens';
import { useKeyCommand } from './keyboard';
import { colors } from './tokens';

export interface ListSearchBarOptions {
  placeholder: string;
  onChangeText: (text: string) => void;
  onSearchButtonPress: (text: string) => void;
  onCancelButtonPress: () => void;
  autoFocus?: boolean;
}
/** The one native list-root configuration; callers receive plain text callbacks. */
export function nativeSearchBarOptions(
  options: ListSearchBarOptions,
): SearchBarProps {
  return {
    placeholder: options.placeholder,
    hideWhenScrolling: false,
    autoCapitalize: 'none',
    autoFocus: options.autoFocus,
    tintColor: colors.navy,
    onChangeText: (event) => options.onChangeText(event.nativeEvent.text),
    onSearchButtonPress: (event) =>
      options.onSearchButtonPress(event.nativeEvent.text),
    onCancelButtonPress: () => options.onCancelButtonPress(),
  };
}
/** Cmd-F belongs to the focused list root, even when other routes stay mounted. */
export function useListSearchBar(
  options: ListSearchBarOptions,
): SearchBarProps {
  const ref = useRef<SearchBarCommands | null>(null);
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!navigation) return () => {};
      const focus = navigation.addListener('focus', listener);
      const blur = navigation.addListener('blur', listener);
      return () => {
        focus();
        blur();
      };
    },
    [navigation],
  );
  const focused = useSyncExternalStore(
    subscribe,
    () => navigation?.isFocused() ?? true,
  );
  useKeyCommand('find', () => ref.current?.focus(), focused);
  useKeyCommand(
    'list-escape',
    () => {
      if (ref.current) ref.current.cancelSearch();
      else options.onCancelButtonPress();
    },
    focused,
  );
  useEffect(() => {
    if (focused && options.autoFocus) ref.current?.focus();
  }, [focused, options.autoFocus]);
  return { ...nativeSearchBarOptions(options), ref };
}
