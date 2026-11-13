/**
 * Native menu titles keep a domain whole: UIKit's menus hyphenated "Open on
 * opax.com.au" as "opax.-com.au" (build 61, bug 6).
 */
import { Platform } from 'react-native';
import { copy } from '../src/design/copy';
import { menuTitle, plainMenuTitle } from '../src/design/menu-title';
import { WORD_JOINER } from '../src/design/record-title';
import { pageMenu } from '../src/navigation/chrome';

afterEach(() => jest.restoreAllMocks());

test('on iOS every character of a domain is joined, and nothing else changes', () => {
  const title = menuTitle('Open on opax.com.au');
  expect(title).toBe(`Open on ${[...'opax.com.au'].join(WORD_JOINER)}`);
  expect(plainMenuTitle(title)).toBe('Open on opax.com.au');
  expect(menuTitle('Queensland portal (data.qld.gov.au)')).toBe(
    `Queensland portal (${[...'data.qld.gov.au'].join(WORD_JOINER)})`,
  );
  for (const plain of [
    'Copy link',
    'Ask about Anthony Albanese',
    'Set Grayndler as my electorate',
    'Version 1.5',
    'e.g. a bill',
  ])
    expect(menuTitle(plain)).toBe(plain);
});

test('binding twice changes nothing', () => {
  const once = menuTitle('Open on opax.com.au');
  expect(menuTitle(once)).toBe(once);
});

test('other platforms keep the title as written', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  expect(menuTitle('Open on opax.com.au')).toBe('Open on opax.com.au');
});

test('More ends in one bound public-site action, even when a page supplies its own', () => {
  for (const items of [
    [{ title: 'Copy link', onPress: jest.fn() }],
    [
      { title: copy.openOnWeb, onPress: jest.fn() },
      { title: 'Copy link', onPress: jest.fn() },
    ],
  ]) {
    const menu = pageMenu({ name: 'A page', items });
    if (menu.type !== 'menu') throw new Error('Expected a menu');
    const labels = menu.menu.items.map((row) => row.label);
    expect(labels.at(-1)).toBe(menuTitle(copy.openOnWeb));
    expect(
      labels.map(plainMenuTitle).filter((l) => l === copy.openOnWeb),
    ).toHaveLength(1);
  }
});
