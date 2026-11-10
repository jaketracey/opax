import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Disclosure } from '../src/design/primitives';
import { YearBills } from '../src/features/explore/YearBills';

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

test('one bill past the first three is offered in the singular', () => {
  const bills = [1, 2, 3, 4].map((n) => ({
    key: `fixture-${n}`,
    title: `Fixture Bill ${n}`,
    status: 'Introduced',
    introduced: `2010-0${n}-01`,
  }));
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
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
