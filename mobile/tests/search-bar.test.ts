import { act, createElement } from 'react';
import TestRenderer from 'react-test-renderer';
import type { SearchBarProps } from 'react-native-screens';
import { NavigationContext } from 'expo-router/react-navigation';
import {
  nativeSearchBarOptions,
  useListSearchBar,
} from '../src/design/search-bar';
import { dispatchKeyCommand } from '../src/design/keyboard';

test.each([false, true])(
  'native list search autoFocus=%s keeps a persistent field and passes plain strings',
  (autoFocus) => {
    const changed = jest.fn(),
      submit = jest.fn(),
      cancel = jest.fn();
    const options = nativeSearchBarOptions({
      placeholder: 'Bills, sponsors and portfolios',
      onChangeText: changed,
      onSearchButtonPress: submit,
      onCancelButtonPress: cancel,
      autoFocus,
    });
    expect(options).toMatchObject({
      autoFocus,
      hideWhenScrolling: false,
      autoCapitalize: 'none',
      placeholder: 'Bills, sponsors and portfolios',
    });
    options.onChangeText!({ nativeEvent: { text: 'Health' } } as never);
    options.onSearchButtonPress!({
      nativeEvent: { text: 'Health bill' },
    } as never);
    options.onCancelButtonPress!({} as never);
    expect(changed).toHaveBeenCalledWith('Health');
    expect(submit).toHaveBeenCalledWith('Health bill');
    expect(cancel).toHaveBeenCalledTimes(1);
  },
);
test.each([false, true])(
  'Cmd-F focuses only the focused list root, focused=%s',
  (focused) => {
    const focus = jest.fn(),
      cancelSearch = jest.fn();
    let options!: SearchBarProps;
    const navigation = {
      isFocused: () => focused,
      addListener: () => () => {},
    };
    function Root() {
      options = useListSearchBar({
        placeholder: 'People',
        onChangeText: jest.fn(),
        onSearchButtonPress: jest.fn(),
        onCancelButtonPress: jest.fn(),
      });
      return null;
    }
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        createElement(
          NavigationContext.Provider,
          { value: navigation as never },
          createElement(Root),
        ),
      );
    });
    options.ref!.current = {
      focus,
      cancelSearch,
      blur: jest.fn(),
      clearText: jest.fn(),
      toggleCancelButton: jest.fn(),
      setText: jest.fn(),
    };
    act(() => {
      dispatchKeyCommand('find');
      dispatchKeyCommand('list-escape');
    });
    expect(focus).toHaveBeenCalledTimes(focused ? 1 : 0);
    expect(cancelSearch).toHaveBeenCalledTimes(focused ? 1 : 0);
    act(() => r.unmount());
    expect(dispatchKeyCommand('find')).toBe(false);
  },
);
