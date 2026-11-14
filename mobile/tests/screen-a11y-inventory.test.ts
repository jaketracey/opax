import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

type Entry = {
  file: string;
  implementation: boolean;
  exports: { exported: string }[];
};
const { screenInventory } = jest.requireActual<{
  screenInventory: (root: string) => Entry[];
}>('./screen-a11y-inventory.cjs');
type Reporter = {
  onRunStart(): void;
  onRunComplete(): void;
  getLastError(): Error | undefined;
};
const ReporterClass = jest.requireActual<
  new (config: { rootDir: string; runTestsByPath?: boolean }) => Reporter
>('./screen-a11y-reporter.cjs');
let root: string;
function source(file: string, content: string) {
  const destination = join(root, file);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'opax-a11y-inventory-'));
  source('src/navigation/stack/screen.tsx', 'const rootTitles = {};');
  source('src/navigation/stack/explore.tsx', 'const names = {};');
});
afterEach(() => {
  jest.restoreAllMocks();
  if (existsSync(root)) rmSync(root, { recursive: true });
});

test.each([
  'export default () => <View />;',
  'export default function () { return <View />; }',
])('a new anonymous route cannot escape coverage: %s', (body) => {
  source('src/app/new.tsx', body);
  expect(screenInventory(root)).toEqual([
    expect.objectContaining({
      file: join(root, 'src/app/new.tsx'),
      implementation: true,
      exports: [{ exported: 'default', name: 'default' }],
    }),
  ]);
});

test('named screen re-exports resolve through a barrel to the implementation', () => {
  source(
    'src/app/new.tsx',
    "export { NewScreen as default } from '../features/entry';",
  );
  source('src/features/entry.tsx', "export { NewScreen } from './New';");
  source(
    'src/features/New.tsx',
    'export function NewScreen() { return <View />; }',
  );
  expect(
    screenInventory(root)
      .filter((entry) => entry.implementation)
      .map((entry) => entry.file),
  ).toEqual([join(root, 'src/features/New.tsx')]);
});

test('redirects and routing wrappers reuse their destination audit', () => {
  source(
    'src/app/old.tsx',
    'export default function Old() { return <Redirect href="/new" />; }',
  );
  source(
    'src/app/new.tsx',
    "import New from '../features/New'; export default function Route() { return <New />; }",
  );
  source(
    'src/features/New.tsx',
    'export default function New() { return <View />; }',
  );
  expect(
    screenInventory(root)
      .filter((entry) => entry.implementation)
      .map((entry) => entry.file),
  ).toEqual([join(root, 'src/features/New.tsx')]);
});

test('a full run fails for an unrendered screen, while a focused run can omit it', () => {
  source('src/app/new.tsx', 'export default () => <View />;');
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const full = new ReporterClass({ rootDir: root });
  full.onRunStart();
  full.onRunComplete();
  expect(full.getLastError()?.message).toContain('src/app/new.tsx');
  const focused = new ReporterClass({ rootDir: root, runTestsByPath: true });
  focused.onRunStart();
  focused.onRunComplete();
  expect(focused.getLastError()).toBeUndefined();
});

test('fresh render evidence satisfies full-run coverage and stale evidence is cleared', () => {
  source('src/app/new.tsx', 'export default () => <View />;');
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const reporter = new ReporterClass({ rootDir: root });
  source('node_modules/.cache/screen-a11y/stale.test.tsx.json', '[]');
  reporter.onRunStart();
  expect(
    existsSync(
      join(root, 'node_modules/.cache/screen-a11y/stale.test.tsx.json'),
    ),
  ).toBe(false);
  source(
    'node_modules/.cache/screen-a11y/new.test.tsx.json',
    JSON.stringify([
      {
        screen: 'src/app/new.tsx',
        components: ['src/app/new.tsx#default'],
        issues: [],
      },
    ]),
  );
  reporter.onRunComplete();
  expect(reporter.getLastError()).toBeUndefined();
});

test('an existing file cannot hide a newly untested named screen export', () => {
  source(
    'src/app/first.tsx',
    "export { FirstScreen as default } from '../features/Pair';",
  );
  source(
    'src/app/second.tsx',
    "export { SecondScreen as default } from '../features/Pair';",
  );
  source(
    'src/features/Pair.tsx',
    'export function FirstScreen() { return <View />; } export function SecondScreen() { return <View />; } export function officialPage() { return null; }',
  );
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const reporter = new ReporterClass({ rootDir: root });
  reporter.onRunStart();
  source(
    'node_modules/.cache/screen-a11y/first.test.tsx.json',
    JSON.stringify([
      {
        screen: 'src/features/Pair.tsx',
        components: ['src/features/Pair.tsx#FirstScreen'],
        issues: [],
      },
    ]),
  );
  reporter.onRunComplete();
  expect(reporter.getLastError()?.message).toContain(
    'src/features/Pair.tsx#SecondScreen',
  );
  expect(reporter.getLastError()?.message).not.toContain('#officialPage');
});
