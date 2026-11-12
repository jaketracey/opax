import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { callStates, endReasons, failures } from '../src/voice/types';

const source = (file: string) =>
  readFileSync(resolve(__dirname, '../modules/opax-voice', file), 'utf8');
const kotlin = (file: string) =>
  source(`android/src/main/java/au/com/opax/voice/${file}.kt`);

test.each([
  ['CallState', callStates],
  ['EndReason', endReasons],
  ['VoiceFailure', failures],
] as const)(
  'Android %s values match the TypeScript decoder',
  (name, values) => {
    const entries = kotlin('Models')
      .match(new RegExp(`enum class ${name} \\{([^}]+)\\}`))![1]!
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    expect(entries.sort()).toEqual([...values].sort());
  },
);

test('Android registers every method in the current TypeScript native surface', () => {
  const methods = [...source('index.ts').matchAll(/^  (\w+)\(/gm)]
    .map((match) => match[1])
    .filter((name) => name !== 'addListener');
  const registered = [
    ...kotlin('OpaxVoiceModule').matchAll(/AsyncFunction\("(\w+)"\)/g),
  ].map((match) => match[1]);
  expect(registered.sort()).toEqual(methods.sort());
});

test('Android projects every event the current Talk reducer consumes', () => {
  const types = readFileSync(
    resolve(__dirname, '../src/voice/types.ts'),
    'utf8',
  )
    .split('export type VoiceEvent =')[1]!
    .split('export type VoiceSnapshot')[0]!;
  const expected = [...types.matchAll(/type: '(\w+)'/g)].map(
    (match) => match[1],
  );
  const projected = [
    ...kotlin('VoiceBridgeValue').matchAll(/"type" to "(\w+)"/g),
  ].map((match) => match[1]);
  expect(projected.sort()).toEqual(expected.sort());
  expect(kotlin('OpaxVoiceModule')).toContain(
    'Events("onVoiceEvent", "onVoiceLevel")',
  );
});
