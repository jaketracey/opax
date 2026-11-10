import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCurrentRecord } from '../src/navigation/record-link';

// The shipped Hermes engine has no Array.prototype.toSorted (TestFlight
// AEi_banN: every person page showed the route error). Jest runs on Node,
// which has it, so remove it here the way the phone lacks it.
const original = Object.getOwnPropertyDescriptor(Array.prototype, 'toSorted');
beforeAll(() => {
  delete (Array.prototype as { toSorted?: unknown }).toSorted;
});
afterAll(() => {
  if (original) Object.defineProperty(Array.prototype, 'toSorted', original);
});

test('a record link compares against the record on screen without toSorted', () => {
  const state = {
    index: 0,
    routes: [{ name: 'person/[slug]', params: { slug: 'anthony-albanese' } }],
  };
  expect(isCurrentRecord('/person/anthony-albanese', state)).toBe(true);
  expect(isCurrentRecord('/person/penny-wong', state)).toBe(false);
  expect(isCurrentRecord('/party/labor', state)).toBe(false);
});

test('app source never calls toSorted', () => {
  const file = readFileSync(
    join(__dirname, '../src/navigation/record-link.ts'),
    'utf8',
  );
  expect(file).not.toMatch(/\.toSorted\(/);
});
