import { accountScreens } from '../src/navigation/stack/account';
import { askAccountScreens } from '../src/navigation/stack/ask';
import {
  licenceScreens,
  referenceScreens,
} from '../src/navigation/stack/reference';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: {} }));

function options(
  screen: ReturnType<typeof accountScreens>[number],
  previous: string,
  at: number,
) {
  const routes = [
    { name: previous, key: 'root' },
    { name: screen.props.name, key: 'pushed' },
  ];
  return screen.props.options({
    route: routes[at],
    navigation: { getState: () => ({ index: at, routes }) },
  });
}

test('Account is the root title and every direct push names Account, independent of the presenting tab', () => {
  const screens = [
    ...accountScreens(),
    ...referenceScreens(),
    ...askAccountScreens(),
  ];
  const root = screens.find((screen) => screen.props.name === 'index')!;
  expect(options(root, 'index', 0).title).toBe('Account');
  for (const screen of screens.filter((screen) => screen !== root)) {
    expect(options(screen, 'index', 1).headerBackTitle).toBe('Account');
  }
});

test('Licence starts without a dataset placeholder and uses Back for its unnamed root', () => {
  const [root, ...pushed] = licenceScreens();
  expect(options(root!, '[id]', 0).title).toBe('');
  for (const screen of pushed)
    expect(options(screen, '[id]', 1).headerBackTitle).toBe('Back');
});
