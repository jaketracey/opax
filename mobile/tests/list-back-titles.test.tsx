import { billsScreens } from '../src/navigation/stack/bills';
import { exploreScreens } from '../src/navigation/stack/explore';
import { publicMoneyScreens } from '../src/navigation/stack/public-money';
import { BarTitle } from '../src/navigation/useTitleOnScroll';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: {} }));

const screens = [
  ...publicMoneyScreens(),
  ...exploreScreens(),
  ...billsScreens(),
];
test.each([
  ['grants', 'Commonwealth grants'],
  ['largest-grants', 'Largest grants'],
  ['grants-allocation', 'Community funding'],
  ['agencies', 'Government agencies'],
  ['connections', 'Programs and places'],
  ['money-record', 'Money record'],
  ['money-item', ''],
  ['explore/[tool]', 'The record quiz'],
  ['division-history', 'Votes in parliament'],
])('%s retains its route title for the next Back button', (name, title) => {
  const screen = screens.find((screen) => screen.props.name === name)!;
  const routes = [
    { key: 'root', name: 'index' },
    { key: 'list', name, params: { tool: 'quiz' } },
    { key: 'next', name: 'money-item' },
  ];
  const navigation = { getState: () => ({ index: 1, routes }) };
  const options = screen.props.options({ route: routes[1], navigation });
  expect(options.title).toBe(title);
  if (name === 'division-history') {
    expect(options.headerTitle).toBe(title);
  } else {
    expect(typeof options.headerTitle).toBe('function');
    const view = options.headerTitle();
    expect(view.props.style.width).toBe(0);
    expect(view.type).not.toBe(BarTitle);
  }
  const next = screens.find((screen) => screen.props.name === 'money-item')!;
  if (name !== 'explore/[tool]') {
    expect(
      next.props.options({ route: routes[2], navigation }).headerBackTitle,
    ).toBe(name === 'money-item' ? 'Back' : title);
  }
});
