import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { BillRow, Disclosure, LinkRow } from '../src/design/primitives';
import { YearBills, yearBills } from '../src/features/explore/YearBills';

jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useSegments: () => [],
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

test('one bill past the first three is offered in the singular', async () => {
  const bills = [1, 2, 3, 4].map((n) => ({
    key: `fixture-${n}`,
    title: `Fixture Bill ${n}`,
    status: 'Introduced',
    introduced: `2010-0${n}-01`,
  }));
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      <YearBills
        year={2010}
        read={{
          record: {
            data: { bills } as never,
            stale: false,
            savedAt: 1,
            asOf: null,
          },
          error: null,
          retry: jest.fn(),
        }}
      />,
    );
  });
  expect(view.root.findByType(Disclosure).props.label).toBe('1 more bill');
});

test('a large year pages the remaining bills without mounting them all', async () => {
  const bills = Array.from({ length: 208 }, (_, i) => ({
    key: `fixture-${i}`,
    title: `Fixture Bill ${String(i).padStart(3, '0')}`,
    status: 'Introduced',
    introduced: '2010-01-01',
  }));
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      <YearBills
        year={2010}
        read={{
          record: {
            data: { bills } as never,
            stale: false,
            savedAt: 1,
            asOf: null,
          },
          error: null,
          retry: jest.fn(),
        }}
      />,
    );
  });
  const visible = () =>
    view.root.findAllByType(BillRow).map((row) => row.props.billKey);
  const control = (id: string) =>
    view.root.findAllByType(LinkRow).find((row) => row.props.testID === id);
  const toggle = () =>
    view.root
      .findByType(Disclosure)
      .findAll(
        (node) =>
          typeof node.props.onPress === 'function' &&
          node.props.accessibilityState?.expanded !== undefined,
      )[0]!
      .props.onPress();
  expect(visible()).toHaveLength(3);
  await act(async () => toggle());
  expect(visible()).toHaveLength(23);
  const reached = [...visible()];
  expect(control('tm-bills-previous')).toBeUndefined();
  while (control('tm-bills-next')) {
    const remaining = bills.length - reached.length;
    expect(control('tm-bills-next')!.props.title).toBe(
      `Next ${Math.min(20, remaining)} bills`,
    );
    await act(async () => control('tm-bills-next')!.props.onPress());
    expect(visible().length).toBeLessThanOrEqual(23);
    reached.push(...visible().slice(3));
  }
  expect(reached).toEqual(
    yearBills(bills as never, 2010).map((bill) => bill.key),
  );
  expect(new Set(reached).size).toBe(208);
  await act(async () => control('tm-bills-previous')!.props.onPress());
  expect(visible()).toHaveLength(23);
  await act(async () => toggle());
  expect(visible()).toHaveLength(3);
  await act(async () => toggle());
  expect(visible()).toEqual(reached.slice(0, 23));
  expect(control('tm-bills-previous')).toBeUndefined();
});
