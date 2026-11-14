/**
 * Native menu titles keep a domain whole: UIKit's menus hyphenated "Open on
 * opax.com.au" as "opax.-com.au" (build 61, bug 6).
 */
import { Platform } from 'react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { copy } from '../src/design/copy';
import { menuTitle, plainMenuTitle } from '../src/design/menu-title';
import { WORD_JOINER } from '../src/design/record-title';
import { pageMenu } from '../src/navigation/chrome';
import { textRampScale } from '../src/design/text-scale';
import { textWidth } from './row-layout';

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
    'Change electorate',
    'Forget my electorate',
    'Ask about Anthony Albanese',
    'Version 1.5',
    'e.g. a bill',
  ])
    expect(menuTitle(plain)).toBe(plain);
});

test('binding twice changes nothing', () => {
  for (const plain of [
    'Open on opax.com.au',
    'Set Grayndler as my electorate',
  ]) {
    const once = menuTitle(plain);
    expect(menuTitle(once)).toBe(once);
  }
});

test('other platforms keep the title as written', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  expect(menuTitle('Open on opax.com.au')).toBe('Open on opax.com.au');
  expect(menuTitle('Set Grayndler as my electorate')).toBe(
    'Set Grayndler as my electorate',
  );
});

test('at AX5 on the 402pt Duo, the full native menu label wraps only between words', () => {
  const plain = 'Set Grayndler as my electorate';
  const menu = pageMenu({
    name: 'Grayndler',
    items: [{ title: plain, onPress: jest.fn() }],
  });
  if (menu.type !== 'menu') throw new Error('Expected a menu');
  const label = menu.menu.items[0]!.label!;
  const electorate = [...'electorate'].join(WORD_JOINER);
  expect(label).toBe(`Set Grayndler as my ${electorate}`);
  expect(plainMenuTitle(label)).toBe(plain);
  // Jest cannot lay out UIKit menus. Model AX5's 53pt body type in a
  // 320pt menu on the 402pt display, reserving 60pt for padding and symbol.
  // Joiners protect every internal breakpoint; the spaces remain available.
  const size = 17 * textRampScale('body', 3.571)!;
  const width = Math.min(320, 402 - 32) - 60;
  const lines: string[] = [];
  let line = '';
  for (const word of label.split(' ')) {
    expect(textWidth(plainMenuTitle(word), size)).toBeLessThanOrEqual(width);
    const next = [line, word].filter(Boolean).join(' ');
    if (line && textWidth(plainMenuTitle(next), size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.at(-1)).toBe(electorate);
  expect(lines.map(plainMenuTitle).join(' ')).toBe(plain);
});

test('every electorate action selector in flow 67 matches both plain and native labels', () => {
  const flow = readFileSync(
    path.join(__dirname, '../.maestro/67-my-mp-entry-points.yaml'),
    'utf8',
  );
  const selectors = flow
    .split('\n')
    .filter((line) =>
      /^- (tapOn|assertNotVisible):.*Set (Grayndler|Sydney) as my /.test(line),
    );
  expect(selectors).toHaveLength(3);
  for (const line of selectors) {
    const pattern = line
      .slice(line.indexOf(':') + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    const seat = pattern.includes('Grayndler') ? 'Grayndler' : 'Sydney';
    const other = seat === 'Grayndler' ? 'Sydney' : 'Grayndler';
    const matcher = new RegExp(`^(?:${pattern})$`, 'u');
    const label = `Set ${seat} as my electorate`;
    expect(matcher.test(label)).toBe(true);
    expect(
      matcher.test(`Set ${seat} as my ${[...'electorate'].join(WORD_JOINER)}`),
    ).toBe(true);
    expect(matcher.test(menuTitle(`Set ${other} as my electorate`))).toBe(
      false,
    );
  }
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
