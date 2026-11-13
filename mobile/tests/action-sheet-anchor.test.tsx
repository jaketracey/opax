import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import type * as ReactNative from 'react-native';
import { ActionSheetIOS, Platform, Share, View } from 'react-native';
import { OpaxShare } from '../modules/opax-share';
import {
  popoverWindow,
  setWindowTraitsOverride,
  type WindowTraits,
} from '../src/design/adaptive';
import { dispatchKeyCommand } from '../src/design/keyboard';
import { confirmAction } from '../src/design/menu';
import { shareSourceLink } from '../src/navigation/share';

jest.mock('../modules/opax-share', () => ({
  OpaxShare: {
    showActionSheet: jest.fn(() => Promise.resolve(-1)),
    dismissActionSheet: jest.fn(() => Promise.resolve()),
    share: jest.fn(() => Promise.resolve(true)),
  },
}));

// The unfolded iPhone Duo's inner display, both postures.
const unfolded: WindowTraits = {
  horizontal: 'regular',
  vertical: 'regular',
  foldable: true,
};
// A Pro Max in landscape: regular width, compact height.
const wideLandscape: WindowTraits = {
  horizontal: 'regular',
  vertical: 'compact',
  foldable: false,
};
const phone: WindowTraits = {
  horizontal: 'compact',
  vertical: 'regular',
  foldable: false,
};

const native = OpaxShare as unknown as {
  showActionSheet?: jest.Mock;
  dismissActionSheet: jest.Mock;
  share: jest.Mock;
};
const presenter = native.showActionSheet!;
const flush = () => act(async () => {});
const forget = [{ title: 'Forget', destructive: true, onPress: jest.fn() }];

let rnSheet: jest.SpyInstance;
let rnDismiss: jest.SpyInstance;
beforeEach(() => {
  rnSheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
  rnDismiss = jest
    .spyOn(ActionSheetIOS, 'dismissActionSheet')
    .mockImplementation(() => undefined);
});
afterEach(() => {
  setWindowTraitsOverride(undefined);
  native.showActionSheet = presenter;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('popoverWindow', () => {
  test.each([
    ['the unfolded Duo (regular/regular)', unfolded, true],
    ['regular width, compact height', wideLandscape, true],
    ['a compact phone window', phone, false],
    ['no traits (module missing)', null, false],
  ] as const)('%s', (_, traits, expected) => {
    expect(popoverWindow(traits)).toBe(expected);
  });
});

describe('iOS action sheets', () => {
  test('a regular-width iPhone window passes the trigger as the anchor', () => {
    setWindowTraitsOverride(unfolded);
    confirmAction('Forget your electorate?', forget, 42, 'Today stops.');
    expect(presenter).toHaveBeenCalledTimes(1);
    expect(presenter.mock.calls[0]![0]).toEqual({
      title: 'Forget your electorate?',
      message: 'Today stops.',
      options: ['Forget', 'Cancel'],
      cancelButtonIndex: 1,
      destructiveButtonIndices: [0],
      anchor: 42,
    });
    expect(rnSheet).not.toHaveBeenCalled();
  });

  test('regular width with a compact height anchors too', () => {
    setWindowTraitsOverride(wideLandscape);
    confirmAction('Who represents you?', forget, 7);
    expect(presenter.mock.calls[0]![0]).toMatchObject({ anchor: 7 });
  });

  test('a mounted trigger view anchors by its node handle', () => {
    setWindowTraitsOverride(unfolded);
    // A host view as React Native hands it to a ref; the test renderer has
    // no native tags, so one stands in for it.
    const trigger = { measureInWindow: jest.fn() } as unknown as View;
    const handle = jest.fn((view: unknown) => (view === trigger ? 77 : null));
    // The exports object menu.tsx reads, not this file's namespace copy.
    const reactNative = jest.requireActual<typeof ReactNative>('react-native');
    jest
      .spyOn(reactNative, 'findNodeHandle', 'get')
      .mockReturnValue(handle as unknown as typeof ReactNative.findNodeHandle);
    confirmAction('More for Grayndler', forget, trigger);
    expect(handle).toHaveBeenCalledWith(trigger);
    expect(presenter.mock.calls[0]![0]).toMatchObject({ anchor: 77 });
    // A compact window never asks for the handle.
    setWindowTraitsOverride(phone);
    confirmAction('More for Grayndler', forget, trigger);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(presenter.mock.calls[1]![0]).not.toHaveProperty('anchor');
    // A view that is no longer mounted still opens the sheet, from the middle.
    setWindowTraitsOverride(unfolded);
    handle.mockImplementation(() => {
      throw new Error('Argument appears to not be a ReactComponent');
    });
    confirmAction('More for Grayndler', forget, trigger);
    expect(presenter).toHaveBeenCalledTimes(3);
    expect(presenter.mock.calls[2]![0]).not.toHaveProperty('anchor');
  });

  test('a compact phone window needs no anchor: the sheet rises from the bottom', () => {
    setWindowTraitsOverride(phone);
    confirmAction('Forget your electorate?', forget, 42);
    expect(presenter).toHaveBeenCalledTimes(1);
    expect(presenter.mock.calls[0]![0]).not.toHaveProperty('anchor');
  });

  test('with no trigger a regular window still presents (the module centres it)', () => {
    setWindowTraitsOverride(unfolded);
    confirmAction('Unfollow all 3?', forget, undefined, 'Today stops.');
    expect(presenter).toHaveBeenCalledTimes(1);
    expect(presenter.mock.calls[0]![0]).not.toHaveProperty('anchor');
    // A point from a long press names no view.
    confirmAction('', forget, { x: 10, y: 20, width: 0, height: 0 });
    expect(presenter.mock.calls[1]![0]).not.toHaveProperty('anchor');
  });

  test('the chosen action runs once; Cancel and a dismissal run nothing', async () => {
    const actions = [
      { title: 'Share', onPress: jest.fn() },
      { title: 'Copy link', onPress: jest.fn() },
    ];
    for (const index of [1, 2, -1]) {
      presenter.mockResolvedValueOnce(index);
      confirmAction('', actions);
      await flush();
    }
    expect(actions[0]!.onPress).not.toHaveBeenCalled();
    expect(actions[1]!.onPress).toHaveBeenCalledTimes(1);
  });

  test('Escape closes the open sheet through the same module', async () => {
    presenter.mockReturnValueOnce(new Promise(() => {}));
    confirmAction('', forget);
    expect(dispatchKeyCommand('list-escape')).toBe(true);
    expect(native.dismissActionSheet).toHaveBeenCalledTimes(1);
    expect(rnDismiss).not.toHaveBeenCalled();
    // Handled once: the command is released with the sheet.
    expect(dispatchKeyCommand('list-escape')).toBe(false);
  });

  test('a binary without the module keeps React Native’s sheet, anchored on regular windows', () => {
    native.showActionSheet = undefined;
    setWindowTraitsOverride(unfolded);
    confirmAction('Forget your electorate?', forget, 42);
    expect(rnSheet.mock.calls[0]![0]).toMatchObject({
      options: ['Forget', 'Cancel'],
      cancelButtonIndex: 1,
      destructiveButtonIndex: [0],
      anchor: 42,
    });
    setWindowTraitsOverride(phone);
    confirmAction('Forget your electorate?', forget, 42);
    expect(rnSheet.mock.calls[1]![0]).not.toHaveProperty('anchor');
    // React Native's callback still chooses the action.
    rnSheet.mock.calls[0]![1](0);
    expect(forget[0]!.onPress).toHaveBeenCalledTimes(1);
  });
});

describe('iPad', () => {
  test('anchors whatever the traits say', () => {
    jest.isolateModules(() => {
      const idiom = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(true);
      try {
        const adaptive = jest.requireActual<
          typeof import('../src/design/adaptive')
        >('../src/design/adaptive');
        const menu =
          jest.requireActual<typeof import('../src/design/menu')>(
            '../src/design/menu',
          );
        expect(adaptive.popoverWindow(null)).toBe(true);
        expect(adaptive.popoverWindow(phone)).toBe(true);
        menu.confirmAction('More for Grayndler', forget, 9);
        expect(presenter.mock.calls[0]![0]).toMatchObject({ anchor: 9 });
      } finally {
        idiom.mockRestore();
      }
    });
  });
});

describe('source links', () => {
  test('iOS shares through the module, which anchors its popover', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'dismissedAction',
    });
    await shareSourceLink('https://www.aph.gov.au/bill', 'A bill');
    expect(native.share).toHaveBeenCalledWith({
      url: 'https://www.aph.gov.au/bill',
      title: 'A bill',
      text: 'A bill',
      external: true,
    });
    expect(share).not.toHaveBeenCalled();
  });
});

// React Native's ActionSheetManager presents every sheet as a popover and
// sets its source on the iPad idiom only (react-native 0.86.3,
// RCTActionSheetManager.mm), and the app links React Native prebuilt, so a
// source patch cannot reach it. Every sheet goes through confirmAction (and
// OPAX's module) or shareSourceLink instead.
test('no screen calls React Native’s action or share sheet directly', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) {
        const text = readFileSync(path, 'utf8');
        const rel = path.replaceAll('\\', '/');
        if (
          /ActionSheetIOS\.(showActionSheetWithOptions|showShareActionSheetWithOptions)/.test(
            text,
          ) &&
          !rel.endsWith('src/design/menu.tsx')
        )
          offenders.push(`${rel}: ActionSheetIOS`);
        if (
          /\bShare\.share\(/.test(text) &&
          !rel.endsWith('src/navigation/share.ts')
        )
          offenders.push(`${rel}: Share.share`);
      }
    }
  };
  walk('src');
  expect(offenders).toEqual([]);
});
