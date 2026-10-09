import { act } from 'react';
import { Modal } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { LinkRow } from '../src/design/primitives';
import { KindPicker } from '../src/features/search/KindPicker';

// Pass 3D: the kind is a plain list with a check mark beside the current one,
// not an action sheet of ten stacked pill buttons (build 32, iphone/20).
const draw = (onChange = jest.fn()) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <KindPicker value="person" onChange={onChange} />,
    );
  });
  const open = () =>
    act(() => renderer.root.findByType(LinkRow).props.onPress());
  const option = (value: string) =>
    renderer.root.find(
      (n) =>
        n.props.testID === `search-kind-option-${value}` &&
        typeof n.props.onPress === 'function',
    );
  return { renderer, open, option, onChange };
};

test('the kind row opens a list of the ten kinds, the current one checked', () => {
  const { renderer, open, option } = draw();
  expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
  open();
  expect(renderer.root.findAllByType(Modal)).toHaveLength(1);
  const labels = renderer.root
    .findAll(
      (n) =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('search-kind-option-') &&
        typeof n.props.onPress === 'function',
    )
    .map((n) => n.props.accessibilityLabel);
  expect(labels).toEqual([
    'People',
    'Declared interests',
    'Pay',
    'Expenses',
    'Records',
    'Political parties',
    'Government agencies',
    'Grants',
    'Bills',
    'Research reports',
  ]);
  expect(option('person').props.accessibilityState).toMatchObject({
    selected: true,
  });
  expect(option('pay').props.accessibilityState).toMatchObject({
    selected: false,
  });
  // No row is a capsule button: they are list rows in a sheet.
  expect(
    renderer.root.findAll((n) => n.props.testID === 'search-kind-sheet'),
  ).not.toHaveLength(0);
});

test('choosing a kind applies it and closes; the current kind and Done change nothing', () => {
  const { renderer, open, option, onChange } = draw();
  open();
  act(() => option('person').props.onPress());
  expect(onChange).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
  open();
  act(() =>
    renderer.root
      .find(
        (n) =>
          n.props.testID === 'search-kind-sheet-done' &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
  open();
  act(() => option('pay').props.onPress());
  expect(onChange).toHaveBeenCalledWith('pay');
  expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
});
