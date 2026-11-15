/**
 * No control takes a touch without answering it. Every touch surface either
 * styles `pressed` itself or names the shared feedback (design/pressable:
 * wash, or none on purpose), and takes its iOS touch timing from the
 * shared primitive rather than React Native's component directly.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { render } from '@testing-library/react-native';
import {
  Platform,
  Pressable as NativePressable,
  StyleSheet,
} from 'react-native';
import {
  IOS_PRESS_DELAY,
  PlainPressable,
  Pressable,
} from '../src/design/pressable';
import { SurfaceContext } from '../src/design/row-padding';
import { colors } from '../src/design/tokens';
import { ScopeChips } from '../src/features/search/ScopeChips';

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
});
const native = (r: ReturnType<typeof render>) =>
  r.UNSAFE_root.find(
    (node) =>
      node.type === (NativePressable as unknown as { type: unknown }).type,
  );
const styleOf = (r: ReturnType<typeof render>, pressed: boolean) => {
  const style = native(r).props.style;
  return StyleSheet.flatten(
    typeof style === 'function' ? style({ pressed }) : style,
  );
};

describe.each([
  ['Pressable', Pressable],
  ['PlainPressable', PlainPressable],
] as const)('%s', (_name, Component) => {
  test('wash is the design pressed fill for the ground, over a plain or a function style', () => {
    Platform.OS = 'ios';
    const plain = render(<Component feedback="wash" style={{ padding: 8 }} />);
    expect(styleOf(plain, false)).toEqual({ padding: 8 });
    // On paper the wash is the sunken fill, as a row's and a quiet button's.
    expect(styleOf(plain, true)).toMatchObject({
      padding: 8,
      backgroundColor: colors.sunken,
    });
    // Never a fade of the content: a pressed control keeps its contrast.
    expect(styleOf(plain, true).opacity).toBeUndefined();
    const own = render(
      <Component
        feedback="wash"
        style={({ pressed }) => ({
          margin: pressed ? 2 : 1,
          borderRadius: 999,
        })}
      />,
    );
    // The surface's own corners win over the wash's default.
    expect(styleOf(own, true)).toMatchObject({
      margin: 2,
      borderRadius: 999,
      backgroundColor: colors.sunken,
    });
    for (const surface of ['sunken', 'raised'] as const) {
      const r = render(
        <SurfaceContext.Provider value={surface}>
          <Component feedback="wash" />
        </SurfaceContext.Provider>,
      );
      // Always a different colour from the ground it sits on.
      expect(styleOf(r, true).backgroundColor).toBe(
        surface === 'sunken' ? colors.raised : colors.dividerSubtle,
      );
    }
  });
  test('none and no feedback leave the style alone', () => {
    Platform.OS = 'ios';
    for (const feedback of ['none', undefined] as const) {
      const r = render(
        <Component feedback={feedback} style={{ padding: 8 }} />,
      );
      expect(styleOf(r, true)).toEqual({ padding: 8 });
      expect(native(r).props.feedback).toBeUndefined();
    }
  });
  test('Android keeps its own feedback: no pressed style is added', () => {
    Platform.OS = 'android';
    const r = render(<Component feedback="wash" style={{ padding: 8 }} />);
    expect(styleOf(r, true).backgroundColor).toBeUndefined();
    expect(native(r).props.feedback).toBeUndefined();
  });
});

test('PlainPressable takes the iOS touch timing and passes Android straight through', () => {
  Platform.OS = 'ios';
  const ios = render(<PlainPressable accessibilityLabel="$5 from 2 donors" />);
  expect(native(ios).props.unstable_pressDelay).toBe(IOS_PRESS_DELAY);
  // The label is the caller's, unchanged.
  expect(native(ios).props.accessibilityLabel).toBe('$5 from 2 donors');
  Platform.OS = 'android';
  const style = { padding: 4 };
  const android = render(<PlainPressable style={style} />);
  expect(native(android).props.unstable_pressDelay).toBeUndefined();
  expect(native(android).props.style).toBe(style);
  expect(native(android).props.android_ripple).toBeUndefined();
});

const root = join(__dirname, '..', 'src');
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );
}
/** Android-only surfaces (the ripple answers) and screens not in a release. */
const outside = (path: string) =>
  /android/i.test(path) ||
  path.startsWith('workbench') ||
  path.startsWith('test-screens');
/**
 * Files other lanes are editing now. Each keeps React Native's Pressable,
 * and the first three a surface with no feedback, until that lane lands;
 * the entry then goes (a listed file that no longer needs it fails below).
 */
const pending = [
  'features/today/FeaturedPeopleCard.tsx',
  'features/search/SearchIdle.tsx',
  'features/search/ResultsHeader.tsx',
  'features/today/YourMPCard.tsx',
  'features/Electorate.tsx',
  'features/bills/BillDetail.tsx',
  'navigation/chrome.ts',
];
/** Each `<Pressable ...>` opening tag and what follows it. */
function surfaces(code: string) {
  const found: { tag: string; after: string; line: number }[] = [];
  for (const match of code.matchAll(/<Pressable\b/g)) {
    let end = match.index + match[0].length;
    for (let depth = 0; end < code.length; end++) {
      const char = code[end];
      if (char === '{') depth++;
      else if (char === '}') depth--;
      else if (char === '>' && depth === 0 && code[end - 1] !== '=') break;
    }
    found.push({
      tag: code.slice(match.index, end + 1),
      after: code.slice(end + 1, end + 80),
      line: code.slice(0, match.index).split('\n').length,
    });
  }
  return found;
}
const answers = ({ tag, after }: { tag: string; after: string }) =>
  /\bfeedback=/.test(tag) ||
  /\bpressed\b/.test(tag) ||
  /^\s*\{\s*\(\{\s*pressed\b/.test(after);
const rawImport = (code: string) =>
  [...code.matchAll(/import\s*\{([^}]*)\}\s*from 'react-native';/g)].some(
    (match) =>
      match[1]!
        .split(',')
        .map((name) => name.trim())
        .includes('Pressable'),
  );

test('the surface scan reads a tag with arrows, braces and a children function', () => {
  const code = `
    <Pressable onPress={() => go(a > b)} style={styles.a}>
    <Pressable feedback="wash" onPress={() => { go(); }}>
    <Pressable style={({ pressed }) => [pressed ? on : off]}>
    <Pressable onPress={go}>
      {({ pressed }) => <Row on={pressed} />}
    </Pressable>`;
  expect(surfaces(code).map(answers)).toEqual([false, true, true, true]);
  expect(rawImport("import { Pressable, View } from 'react-native';")).toBe(
    true,
  );
  expect(rawImport("import { PressableProps } from 'react-native';")).toBe(
    false,
  );
});

test('every touch surface answers a press, with the shared timing', () => {
  const silent: string[] = [];
  const raw: string[] = [];
  const settled: string[] = [];
  let count = 0;
  for (const file of sources(root)) {
    const path = relative(root, file);
    if (outside(path) || path === 'design/pressable.tsx') continue;
    const code = readFileSync(file, 'utf8');
    const quiet = surfaces(code).filter((surface) => !answers(surface));
    count += surfaces(code).length;
    const direct = rawImport(code);
    if (pending.includes(path)) {
      if (!quiet.length && !direct) settled.push(path);
      continue;
    }
    silent.push(...quiet.map((surface) => `${path}:${surface.line}`));
    if (direct) raw.push(path);
  }
  expect(count).toBeGreaterThan(100);
  expect(silent).toEqual([]);
  expect(raw).toEqual([]);
  // Nothing stays listed once its lane has landed and the file is clean.
  expect(settled).toEqual([]);
});

describe('the wash only where it can be seen', () => {
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  test('no press target on the black photo ground takes the paper wash', () => {
    // Release builds are light, so the wash is a paper tone: behind the
    // white text of the photo viewer and a failed picture it hid the text.
    for (const path of [
      'features/explore/PhotoViewer.tsx',
      'features/explore/Picture.tsx',
    ]) {
      const code = read(path);
      expect(code).toMatch(/colors\.onBand|onBlack/);
      expect({ path, wash: /feedback="wash"/.test(code) }).toEqual({
        path,
        wash: false,
      });
    }
  });
  test('a target laid over a drawing takes no wash: it would cover what it selects', () => {
    const charts = read('design/charts.tsx');
    const target = charts.slice(
      charts.indexOf('return onSelect ? ('),
      charts.indexOf('accessible style={style} />'),
    );
    expect(target).toMatch(/styles\.barTarget|style=\{style\}/);
    expect(target).toMatch(/feedback="none"/);
    expect(target).not.toMatch(/feedback="wash"/);
  });
  const pressedGround = (
    r: ReturnType<typeof render>,
    testID: string,
    pressed: boolean,
  ) => {
    const node = r.UNSAFE_root.find(
      (n) =>
        n.type === (NativePressable as unknown as { type: unknown }).type &&
        n.props.testID === testID,
    );
    return StyleSheet.flatten(node.props.style({ pressed })).backgroundColor;
  };
  test('a scope chip shows a press, and the selected chip keeps its navy wash under a finger', () => {
    Platform.OS = 'ios';
    const r = render(
      <ScopeChips
        options={[
          { value: 'all', label: 'All', testID: 'chip-all' },
          { value: 'bills', label: 'Bills', testID: 'chip-bills' },
        ]}
        value="bills"
        onChange={() => undefined}
        label="Search scope"
      />,
    );
    expect(pressedGround(r, 'chip-all', false)).toBe(colors.paper);
    expect(pressedGround(r, 'chip-all', true)).toBe(colors.sunken);
    expect(pressedGround(r, 'chip-bills', false)).toBe(colors.navyWash);
    expect(pressedGround(r, 'chip-bills', true)).toBe(colors.navyWash);
  });
  test("Ask's option chips are filled with the wash colour, so they press to the next tone", () => {
    const dock = read('features/ask/AskDock.tsx');
    expect(dock).toMatch(
      /chipPressed: \{ backgroundColor: colors\.dividerSubtle \}/,
    );
    expect(dock).toMatch(/backgroundColor: colors\.sunken/);
    expect(dock).not.toMatch(/feedback="wash"[^>]*style=\{styles\.chip\}/s);
    expect(colors.dividerSubtle).not.toEqual(colors.sunken);
  });
});
