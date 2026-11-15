// The bar items a page stands in before its own arrive. Beside a vertical
// bar (the closed iPhone Duo) the items sit on the rail, where a spacing
// item takes no room and is no bar content: every pushed page was first
// laid out with no title band, 58 pt higher, and dropped when the real
// Share and More arrived (b74). The stand-ins there are the buttons.
import { Platform } from 'react-native';
import { pendingHeaderItems } from '../src/navigation/chrome';

let mockBarEdge: 'unspecified' | 'leading' | 'trailing' = 'unspecified';
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: { getVerticalBarEdge: () => mockBarEdge },
  useVerticalBarEdge: () => mockBarEdge,
}));

const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
function at(edge: typeof mockBarEdge, ios: number) {
  mockBarEdge = edge;
  jest.replaceProperty(Platform, 'OS', 'ios');
  Object.defineProperty(Platform, 'Version', {
    configurable: true,
    value: ios,
  });
}
afterEach(() => {
  mockBarEdge = 'unspecified';
  if (version) Object.defineProperty(Platform, 'Version', version);
});

const labels = (name: string, params?: object) =>
  pendingHeaderItems(name, params)?.map((item) =>
    item.type === 'spacing'
      ? `spacing ${item.spacing}`
      : `${'label' in item ? item.label : item.type}${
          'disabled' in item && item.disabled ? ' (disabled)' : ''
        }`,
  );

test.each(['leading', 'trailing'] as const)(
  'beside a %s rail the stand-ins are the disabled buttons themselves',
  (edge) => {
    at(edge, 27);
    expect(labels('person/[slug]')).toEqual([
      'Share (disabled)',
      'More (disabled)',
    ]);
    expect(labels('bill/[key]')).toEqual([
      'Share (disabled)',
      'More (disabled)',
    ]);
    expect(labels('directory')).toEqual([
      'Filters (disabled)',
      'More (disabled)',
    ]);
    expect(labels('grant-program')).toEqual(['More (disabled)']);
    // The real More item is matched across the swap by its identifier.
    expect(pendingHeaderItems('person/[slug]')!.at(-1)).toMatchObject({
      identifier: 'header-more',
    });
    // No items of its own, and a sheet: nothing, as before.
    expect(labels('topics')).toBeUndefined();
    expect(labels('money-item', { sheet: '1' })).toBeUndefined();
  },
);

test.each([
  // iPhone, iPad and the unfolded Duo.
  ['unspecified', 27],
  // Before iOS 26 there is no rail.
  ['trailing', 18],
] as const)(
  'beside a %s bar on iOS %s the stand-in is the spacing it always was',
  (edge, ios) => {
    at(edge, ios);
    expect(labels('person/[slug]')).toEqual(['spacing 104']);
    expect(labels('directory')).toEqual(['spacing 104']);
    expect(labels('grant-program')).toEqual(['spacing 44']);
  },
);
