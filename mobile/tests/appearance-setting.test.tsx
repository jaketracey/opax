import Constants from 'expo-constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { Appearance, Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  appearanceChoice,
  appearanceChoices,
  appearanceSettingOffered,
  colorSchemeFor,
  decodeAppearance,
  setAppearance,
  startAppearance,
} from '../src/design/appearance-setting';
import { dark, light } from '../src/design/palette';
import { colors as dynamicColors } from '../src/design/tokens';
import { useColors, useIsDark, type Colors } from '../src/design/use-colors';
import { AccountRowsScreen } from '../src/features/account/AccountRows';
import { AccountScreen } from '../src/features/account/AccountScreen';
import { accountCopy } from '../src/features/account/copy';
import { AppearanceGroup } from '../src/features/account/parts';

// The Appearance setting (20 Nov 2026): Match phone, Light or Dark for OPAX
// itself, kept on the device, applied before the first frame and again on
// each change, and only in a build that follows the system.

// An in-memory documents folder, read synchronously as the app reads it.
const mockFiles = new Map<string, string>();
const mockDisk = { reads: 0, failRead: false, failWrite: false };
jest.mock('expo-file-system', () => {
  class File {
    path: string;
    constructor(directory: string, name: string) {
      this.path = `${directory}/${name}`;
    }
    get exists() {
      mockDisk.reads += 1;
      if (mockDisk.failRead) throw new Error('documents unavailable');
      return mockFiles.has(this.path);
    }
    textSync() {
      mockDisk.reads += 1;
      return mockFiles.get(this.path)!;
    }
    write(text: string) {
      if (mockDisk.failWrite) throw new Error('disk full');
      mockFiles.set(this.path, text);
    }
  }
  return { File, Paths: { document: 'documents' } };
});
const STORED = 'documents/opax-appearance-v1.json';

// The build's switch as app.config.ts exposes it (plugins/appearance.js).
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { userInterfaceStyle: 'automatic', extra: {} } },
}));
const build = (style: 'light' | 'automatic' | undefined) => {
  (Constants.expoConfig as { userInterfaceStyle?: string }).userInterfaceStyle =
    style;
};

jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual('react');
  const Link = ({ children, ...props }: { children: unknown }) =>
    createElement('Link', props, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
    Link,
    useFocusEffect: jest.fn(),
    useIsPreview: () => false,
  };
});
jest.mock('../src/voice', () => ({
  status: jest.fn(async () => ({ ok: false, error: 'unavailable' })),
  subscribe: jest.fn(() => () => {}),
}));
jest.mock('../src/voice/linked', () => ({ voiceLinked: true }));

// React Native's Appearance as the platforms behave: the override is what
// `getColorScheme()` reports, `unspecified` hands back to the system, and a
// change of the scheme on screen tells the listeners.
const originalOS = Platform.OS;
let system: 'light' | 'dark';
let override: 'light' | 'dark' | null;
let schemeListeners: Set<() => void>;
let setColorScheme: jest.SpyInstance;
const onScreen = () => override ?? system;
beforeEach(() => {
  mockFiles.clear();
  Object.assign(mockDisk, { reads: 0, failRead: false, failWrite: false });
  build('automatic');
  system = 'light';
  override = null;
  schemeListeners = new Set();
  jest.spyOn(Appearance, 'getColorScheme').mockImplementation(onScreen);
  jest.spyOn(Appearance, 'addChangeListener').mockImplementation(((
    listener: () => void,
  ) => {
    schemeListeners.add(listener);
    return { remove: () => schemeListeners.delete(listener) };
  }) as never);
  setColorScheme = jest
    .spyOn(Appearance, 'setColorScheme')
    .mockImplementation((scheme) => {
      const before = onScreen();
      override = scheme === 'light' || scheme === 'dark' ? scheme : null;
      if (onScreen() !== before)
        for (const listener of [...schemeListeners]) listener();
    });
  // The module's state is the launch's: every test starts a fresh launch.
  startAppearance();
  setColorScheme.mockClear();
  mockDisk.reads = 0;
});
afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

/** A launch: the stored document, then the root layout's startup call. */
function launch(stored?: string) {
  if (stored === undefined) mockFiles.delete(STORED);
  else mockFiles.set(STORED, stored);
  startAppearance();
}

describe('the store', () => {
  test('with nothing stored the choice is Match phone and nothing is overridden', () => {
    launch();
    expect(appearanceChoice()).toBe('system');
    expect(setColorScheme).not.toHaveBeenCalled();
  });

  test('a choice is written to the device and read back at the next launch', () => {
    for (const choice of ['dark', 'light', 'system'] as const) {
      launch();
      setAppearance(choice === 'system' ? 'dark' : choice);
      setAppearance(choice);
      expect(JSON.parse(mockFiles.get(STORED)!)).toEqual({
        appearance: choice,
      });
      // The next launch knows only the file.
      const stored = mockFiles.get(STORED);
      launch();
      expect(appearanceChoice()).toBe('system');
      launch(stored);
      expect(appearanceChoice()).toBe(choice);
    }
  });

  test.each([
    ['not JSON', '{"appearance":"da'],
    ['an empty file', ''],
    ['an unknown value', '{"appearance":"sepia"}'],
    ['a value of the wrong case', '{"appearance":"Dark"}'],
    ['a value of the wrong type', '{"appearance":1}'],
    ['another document', '{"version":1}'],
    ['a bare string', '"dark"'],
    ['null', 'null'],
    ['an array', '["dark"]'],
  ])('%s means Match phone and the app still starts', (_name, stored) => {
    expect(() => launch(stored)).not.toThrow();
    expect(appearanceChoice()).toBe('system');
    expect(setColorScheme).not.toHaveBeenCalled();
    expect(decodeAppearance(stored)).toBe('system');
  });

  test('a documents folder that cannot be read means Match phone, not a crash', () => {
    mockDisk.failRead = true;
    expect(() => launch('{"appearance":"dark"}')).not.toThrow();
    expect(appearanceChoice()).toBe('system');
    expect(setColorScheme).not.toHaveBeenCalled();
  });

  test('a native override that throws does not stop the launch', () => {
    setColorScheme.mockImplementation(() => {
      throw new Error('no window');
    });
    expect(() => launch('{"appearance":"dark"}')).not.toThrow();
    expect(appearanceChoice()).toBe('dark');
  });

  test('a save that fails still changes the app for this session', () => {
    mockDisk.failWrite = true;
    expect(() => setAppearance('dark')).not.toThrow();
    expect(appearanceChoice()).toBe('dark');
    expect(setColorScheme).toHaveBeenCalledWith('dark');
    expect(mockFiles.has(STORED)).toBe(false);
  });

  test('decodes each of the three values', () => {
    expect(appearanceChoices).toEqual(['system', 'light', 'dark']);
    for (const choice of appearanceChoices)
      expect(decodeAppearance(JSON.stringify({ appearance: choice }))).toBe(
        choice,
      );
  });
});

describe('applying it', () => {
  test('Match phone is unspecified, Light is light, Dark is dark', () => {
    expect(colorSchemeFor('system')).toBe('unspecified');
    expect(colorSchemeFor('light')).toBe('light');
    expect(colorSchemeFor('dark')).toBe('dark');
  });

  test('each change of the setting sets React Native’s override', () => {
    setAppearance('dark');
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
    setAppearance('light');
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
    setAppearance('system');
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');
    expect(setColorScheme).toHaveBeenCalledTimes(3);
    // Choosing what is already chosen does nothing.
    setAppearance('system');
    expect(setColorScheme).toHaveBeenCalledTimes(3);
  });

  test('the launch applies a stored Dark or Light, synchronously', () => {
    launch('{"appearance":"dark"}');
    expect(setColorScheme).toHaveBeenCalledTimes(1);
    expect(setColorScheme).toHaveBeenCalledWith('dark');
    expect(Appearance.getColorScheme()).toBe('dark');
    system = 'dark';
    launch('{"appearance":"light"}');
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
    expect(Appearance.getColorScheme()).toBe('light');
  });

  test('the root layout applies it while its module loads, before the root can render', () => {
    const source = readFileSync(
      join(__dirname, '../src/app/_layout.tsx'),
      'utf8',
    );
    expect(source).toContain(
      "import { startAppearance } from '../design/appearance-setting';",
    );
    // At module scope (column 0), once, above the root component.
    const calls = source.match(/^startAppearance\(\);$/gm) ?? [];
    expect(calls).toHaveLength(1);
    expect(source.match(/startAppearance\(/g)).toHaveLength(1);
    expect(source.indexOf('\nstartAppearance();')).toBeLessThan(
      source.indexOf('export default function Layout()'),
    );
  });

  test('Android: the first render after a launch with Dark stored is already dark', () => {
    Platform.OS = 'android';
    launch('{"appearance":"dark"}');
    const seen: Colors[] = [];
    function Probe() {
      seen.push(useColors());
      return null;
    }
    act(() => {
      TestRenderer.create(<Probe />);
    });
    expect(seen).toEqual([dark]);
  });
});

describe('a light-only build', () => {
  test.each([['light' as const], [undefined]])(
    'style %s: a stored Dark is never read or applied',
    (style) => {
      build(style);
      expect(appearanceSettingOffered()).toBe(false);
      launch('{"appearance":"dark"}');
      expect(appearanceChoice()).toBe('system');
      expect(setColorScheme).not.toHaveBeenCalled();
      expect(mockDisk.reads).toBe(0);
    },
  );

  test('nothing can set an override or write a choice', () => {
    build('light');
    launch();
    setAppearance('dark');
    expect(appearanceChoice()).toBe('system');
    expect(setColorScheme).not.toHaveBeenCalled();
    expect(mockFiles.has(STORED)).toBe(false);
  });

  test('a choice made in a build that follows the system does not carry into it', () => {
    setAppearance('dark');
    expect(appearanceChoice()).toBe('dark');
    build('light');
    startAppearance();
    expect(appearanceChoice()).toBe('system');
  });

  test.each([
    ['the sheet with account groups', AccountScreen],
    ['the sheet without them', AccountRowsScreen],
  ])('%s shows no Appearance group', (_name, Sheet) => {
    build('light');
    launch('{"appearance":"dark"}');
    const sheet = render(<Sheet />);
    expect(sheet.root.findAllByProps({ testID: 'account-appearance' })).toEqual(
      [],
    );
    expect(
      sheet.root.findAll(
        (node) =>
          typeof node.props.testID === 'string' &&
          node.props.testID.startsWith('account-appearance'),
      ),
    ).toEqual([]);
    expect(
      sheet.root.findAllByProps({ testID: 'account-links' }).length,
    ).toBeGreaterThan(0);
  });
});

function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

/** A host node by test id (a composite passes its props down, so the last). */
function host(renderer: TestRenderer.ReactTestRenderer, testID: string) {
  const found = renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
  expect([testID, found.length]).toEqual([testID, 1]);
  return found[0]!;
}
const rowIDs = appearanceChoices.map(
  (choice) => `account-appearance-${choice}`,
);
/** Which rows draw the trailing checkmark. */
function ticked(renderer: TestRenderer.ReactTestRenderer) {
  return rowIDs.filter(
    (id) =>
      host(renderer, id).findAll(
        (node) =>
          typeof node.type !== 'string' && node.props.name === 'checkmark',
      ).length > 0,
  );
}
const selected = (renderer: TestRenderer.ReactTestRenderer) =>
  rowIDs.filter(
    (id) => host(renderer, id).props.accessibilityState?.selected === true,
  );
const press = (renderer: TestRenderer.ReactTestRenderer, id: string) =>
  act(() => {
    host(renderer, id).props.onClick?.({ stopPropagation: () => undefined });
  });

describe('the rows', () => {
  test('three choices under an Appearance heading, with the footer', () => {
    const group = render(<AppearanceGroup />);
    expect(
      rowIDs.map((id) => host(group, id).props.accessibilityLabel),
    ).toEqual(['Match phone', 'Light', 'Dark']);
    const text = JSON.stringify(group.toJSON());
    expect(text).toContain('Appearance');
    expect(text).toContain(
      'Match phone follows your phone’s light or dark setting.',
    );
    const heading = group.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityRole === 'header',
    );
    expect(heading).toHaveLength(1);
    expect(accountCopy.appearance).toBe('Appearance');
    expect(accountCopy.appearanceSystem).toBe('Match phone');
    expect(accountCopy.appearanceLight).toBe('Light');
    expect(accountCopy.appearanceDark).toBe('Dark');
    expect(accountCopy.appearanceFooter).toBe(
      'Match phone follows your phone’s light or dark setting.',
    );
  });

  test('each row speaks its name and whether it is the one chosen', () => {
    const group = render(<AppearanceGroup />);
    for (const id of rowIDs) {
      const row = host(group, id);
      expect(row.props.accessible).toBe(true);
      expect(row.props.accessibilityRole).toBe('button');
      expect(typeof row.props.accessibilityState.selected).toBe('boolean');
    }
    expect(selected(group)).toEqual(['account-appearance-system']);
    expect(ticked(group)).toEqual(['account-appearance-system']);
  });

  test('choosing a row applies it, keeps it and moves the checkmark', () => {
    const group = render(<AppearanceGroup />);
    press(group, 'account-appearance-dark');
    expect(setColorScheme).toHaveBeenCalledTimes(1);
    expect(setColorScheme).toHaveBeenCalledWith('dark');
    expect(JSON.parse(mockFiles.get(STORED)!)).toEqual({ appearance: 'dark' });
    expect(selected(group)).toEqual(['account-appearance-dark']);
    expect(ticked(group)).toEqual(['account-appearance-dark']);

    press(group, 'account-appearance-light');
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
    expect(JSON.parse(mockFiles.get(STORED)!)).toEqual({ appearance: 'light' });
    expect(ticked(group)).toEqual(['account-appearance-light']);

    press(group, 'account-appearance-system');
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');
    expect(JSON.parse(mockFiles.get(STORED)!)).toEqual({
      appearance: 'system',
    });
    expect(selected(group)).toEqual(['account-appearance-system']);
    expect(ticked(group)).toEqual(['account-appearance-system']);

    // The chosen row again: nothing is applied or written twice.
    press(group, 'account-appearance-system');
    expect(setColorScheme).toHaveBeenCalledTimes(3);
  });

  test('the sheet opens with the stored choice ticked', () => {
    launch('{"appearance":"light"}');
    const group = render(<AppearanceGroup />);
    expect(ticked(group)).toEqual(['account-appearance-light']);
    expect(selected(group)).toEqual(['account-appearance-light']);
  });

  test.each([
    ['signed out, with account groups', AccountScreen, 'account-section'],
    ['without account groups', AccountRowsScreen, null],
  ])(
    'the group sits above the links: %s',
    (_name, Sheet, before: string | null) => {
      const sheet = render(<Sheet />);
      const order = sheet.root
        .findAll(
          (node) =>
            typeof node.type === 'string' &&
            ['account-section', 'account-appearance', 'account-links'].includes(
              node.props.testID as string,
            ),
        )
        .map((node) => node.props.testID as string);
      expect(order).toEqual([
        ...(before ? [before] : []),
        'account-appearance',
        'account-links',
      ]);
    },
  );
});

describe('the app follows the choice at once', () => {
  function mount() {
    const seen = { colors: [] as Colors[], isDark: [] as boolean[] };
    function Screen() {
      seen.colors.push(useColors());
      seen.isDark.push(useIsDark());
      return null;
    }
    const renderer = render(<Screen />);
    return { seen, renderer };
  }

  test('Android: Dark on a light phone redraws a mounted screen in the dark palette', () => {
    Platform.OS = 'android';
    const { seen } = mount();
    expect(seen.colors).toEqual([light]);
    expect(seen.isDark).toEqual([false]);
    act(() => setAppearance('dark'));
    expect(seen.colors.at(-1)).toBe(dark);
    expect(seen.isDark.at(-1)).toBe(true);
    expect(seen.colors.length).toBeGreaterThan(1);
    // Back to the phone's own setting.
    act(() => setAppearance('system'));
    expect(seen.colors.at(-1)).toBe(light);
    expect(seen.isDark.at(-1)).toBe(false);
  });

  test('Android: Light on a dark phone redraws it in the light palette', () => {
    Platform.OS = 'android';
    system = 'dark';
    const { seen } = mount();
    expect(seen.colors).toEqual([dark]);
    act(() => setAppearance('light'));
    expect(seen.colors.at(-1)).toBe(light);
    expect(seen.isDark.at(-1)).toBe(false);
    // The phone turning light later changes nothing while Light is chosen.
    const draws = seen.colors.length;
    act(() => {
      system = 'light';
      for (const listener of [...schemeListeners]) listener();
    });
    expect(seen.colors.length).toBe(draws);
  });

  test('Android: choosing from the rows redraws a screen mounted under the sheet', () => {
    Platform.OS = 'android';
    const { seen } = mount();
    const group = render(<AppearanceGroup />);
    press(group, 'account-appearance-dark');
    expect(seen.colors.at(-1)).toBe(dark);
    expect(ticked(group)).toEqual(['account-appearance-dark']);
  });

  test('iOS: the dynamic roles stay as they are and useIsDark follows the override', () => {
    Platform.OS = 'ios';
    const { seen } = mount();
    expect(seen.isDark).toEqual([false]);
    act(() => setAppearance('dark'));
    expect(seen.isDark.at(-1)).toBe(true);
    expect(new Set(seen.colors)).toEqual(new Set([dynamicColors]));
    act(() => setAppearance('light'));
    expect(seen.isDark.at(-1)).toBe(false);
  });
});
