import { fireEvent, render } from '@testing-library/react-native';
import { Platform, ScrollView } from 'react-native';
import { ScopeChips } from '../src/features/search/ScopeChips';

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
});
const options = [
  { value: 'all', label: 'All' },
  { value: 'bills', label: 'Bills' },
  { value: 'speeches', label: 'Speeches' },
];
test.each(['android', 'ios'] as const)(
  '%s scope chips expose one tablist, selected tabs and spoken positions',
  (os) => {
    Platform.OS = os;
    const change = jest.fn();
    const r = render(
      <ScopeChips
        options={options}
        value="bills"
        onChange={change}
        label="Search scope"
        testID="scopes"
      />,
    );
    expect(r.UNSAFE_getByType(ScrollView).props).toMatchObject({
      accessibilityRole: 'tablist',
      accessibilityLabel: 'Search scope',
    });
    const tabs = r.getAllByRole('tab');
    expect(
      tabs.map((tab) => [
        tab.props.role,
        tab.props.accessibilityLabel,
        tab.props.accessibilityState.selected,
      ]),
    ).toEqual([
      ['tab', 'All, 1 of 3', false],
      ['tab', 'Bills, 2 of 3', true],
      ['tab', 'Speeches, 3 of 3', false],
    ]);
    fireEvent.press(tabs[1]!);
    expect(change).not.toHaveBeenCalled();
    fireEvent.press(tabs[2]!);
    expect(change).toHaveBeenCalledWith('speeches');
    r.rerender(
      <ScopeChips
        options={options.slice(1)}
        value="speeches"
        onChange={change}
        label="Search scope"
        testID="scopes"
      />,
    );
    expect(
      r.getByRole('tab', { name: 'Speeches, 2 of 2' }).props.accessibilityState
        .selected,
    ).toBe(true);
  },
);
