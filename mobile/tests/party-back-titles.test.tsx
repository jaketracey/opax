import { Platform } from 'react-native';
import { sharedScreens } from '../src/navigation/stack';
import { detailBackOptions, untitled } from '../src/navigation/stack/screen';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: {} }));

const entries = [
  { path: 'Today', name: 'index', back: 'Today' },
  {
    path: 'a donor money record',
    name: 'money-record',
    params: { node: 'donor:westpac', name: 'Westpac Banking Corporation' },
    back: 'Westpac Banking Corporation',
  },
  {
    path: 'another party',
    name: 'party/[slug]',
    params: { slug: 'greens', name: 'Greens' },
    back: 'Greens',
  },
  {
    path: 'a person',
    name: 'person/[slug]',
    params: { slug: 'anthony-albanese', name: 'Anthony Albanese' },
    back: 'Anthony Albanese',
  },
  { path: 'the money map', name: 'money', back: 'Money map' },
  { path: 'Search', name: 'search', back: 'Search' },
  {
    path: 'a bill',
    name: 'bill/[key]',
    params: { key: 'au-federal-r7520', name: 'A bill' },
    back: 'A bill',
  },
  ...[
    'party/[slug]',
    'person/[slug]',
    'bill/[key]',
    'money-item',
    'money-record',
  ].flatMap((name) => [
    {
      path: `an unnamed ${name}`,
      name,
      back: name === 'money-record' ? 'Money record' : 'Back',
    },
    {
      path: `a whitespace-only ${name}`,
      name,
      params: { name: ' \t\n\u00a0 ' },
      back: name === 'money-record' ? 'Money record' : 'Back',
    },
    {
      path: `a padded ${name}`,
      name,
      params: { name: '  Known   subject \n ' },
      back: 'Known subject',
    },
  ]),
];

const destinations = [
  'party/[slug]',
  'person/[slug]',
  'bill/[key]',
  'money-record',
  'money-item',
];
const originalPlatform = Platform.OS;
afterEach(() => {
  Platform.OS = originalPlatform;
});

describe.each(destinations)('%s', (destination) => {
  test('settles a directory back label before the destination mounts', () => {
    Platform.OS = 'ios';
    const screens = sharedScreens('(today)', false);
    const previous = screens.find((item) => item.props.name === 'directory')!;
    const current = screens.find((item) => item.props.name === destination)!;
    const routes = [
      { key: 'root', name: 'index' },
      { key: 'list', name: 'directory', params: { kind: 'party' } },
      { key: 'current', name: destination },
    ];
    const navigation = { getState: () => ({ index: 2, routes }) };
    expect(previous.props.options({ route: routes[1], navigation }).title).toBe(
      'Parties',
    );
    const options = current.props.options({ route: routes[2], navigation });
    expect(options).toMatchObject({
      headerBackTitle: 'Parties',
      headerBackButtonDisplayMode: 'default',
      headerBackButtonMenuEnabled: true,
    });
  });

  test.each(entries)(
    'from $path keeps a visible, named native back item',
    (entry) => {
      Platform.OS = 'ios';
      const screens = sharedScreens(
        entry.name === 'search' ? '(search)' : '(today)',
        false,
      );
      const previous = screens.find((item) => item.props.name === entry.name)!;
      const current = screens.find((item) => item.props.name === destination)!;
      const routes = [
        ...(['index', 'search'].includes(entry.name)
          ? []
          : [{ key: 'root', name: 'index' }]),
        { key: 'previous', name: entry.name, params: entry.params },
        { key: 'current', name: destination, params: { name: 'Labor' } },
      ];
      const navigation = {
        getState: () => ({ index: routes.length - 1, routes }),
      };
      // Build the source as well, including untitled readers and their empty
      // custom header views. The destination must supply its own safe back name.
      const source = previous.props.options({
        route: routes.at(-2),
        navigation,
      });
      expect(source).toHaveProperty('title');
      const options = current.props.options({
        route: routes.at(-1),
        navigation,
      });
      expect(options).toMatchObject({
        headerBackTitle: entry.back,
        headerBackButtonDisplayMode: 'default',
        headerBackButtonMenuEnabled: true,
      });
      expect(options.headerBackTitle.trim()).toBe(options.headerBackTitle);
    },
  );

  test.each(entries)(
    'from $path leaves Android back behaviour unchanged',
    (entry) => {
      Platform.OS = 'android';
      const current = sharedScreens('(today)', false).find(
        (item) => item.props.name === destination,
      )!;
      const routes = [
        { key: 'previous', name: entry.name, params: entry.params },
        { key: 'current', name: destination },
      ];
      const options = current.props.options({
        route: routes[1],
        navigation: { getState: () => ({ index: 1, routes }) },
      });
      if (destination !== 'money-item')
        expect(options.headerBackTitle).toBeUndefined();
      expect(options.headerBackButtonDisplayMode).toBeUndefined();
      expect(options.headerBackButtonMenuEnabled).toBeUndefined();
      expect(options.headerTitle).toBe(untitled.headerTitle);
      expect(
        detailBackOptions(
          { getState: () => ({ routes }) },
          routes[1]!.key,
          destination,
        ),
      ).toEqual({});
    },
  );
});
