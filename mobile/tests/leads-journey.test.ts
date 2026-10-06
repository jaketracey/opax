import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pinned } from './pinned';

// Journey 27's figures come from the pinned exports, not from memory: each
// "# pointer:" annotation names a value by JSON pointer (RFC 6901), and the
// assertion after it must show that value as the app formats it. The
// formatting here is written out independently of the app's formatters.
const journey = readFileSync(
  resolve(__dirname, '../.maestro/27-leads.yaml'),
  'utf8',
);

function at(document: unknown, pointer: string): unknown {
  if (pointer === '') return document;
  if (!pointer.startsWith('/'))
    throw new Error(`Not a JSON pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((value, token) => {
      if (
        Array.isArray(value) &&
        /^(?:0|[1-9]\d*)$/.test(token) &&
        Number(token) < value.length
      )
        return value[Number(token)];
      if (value && typeof value === 'object' && Object.hasOwn(value, token))
        return (value as Record<string, unknown>)[token];
      throw new Error(`Pointer ${pointer} does not resolve at ${token}`);
    }, document);
}

const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
function shown(value: unknown, as?: string): string {
  if (as === 'dollars') return `${grouped(Math.round(Number(value)))} dollars`;
  if (as === 'count') return grouped(Number(value));
  if (as === 'percent') return `${Number(value).toFixed(1)} percent`;
  if (as === 'millions')
    return `${(Number(value) / 1e6).toFixed(1)} million dollars`;
  if (as) throw new Error(`Unknown pointer format: ${as}`);
  if (typeof value === 'string') {
    const stamp = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
    return stamp
      ? `${Number(stamp[3])} ${months[Number(stamp[2]) - 1]} ${stamp[1]}`
      : value;
  }
  if (value && typeof value === 'object' && 'label' in value) {
    const metric = value as { label: string; value: number; format: string };
    const spoken =
      metric.format === 'currency'
        ? shown(metric.value, 'dollars')
        : metric.format === 'percent'
          ? shown(metric.value, 'percent')
          : shown(metric.value, 'count');
    return `${metric.label}, ${spoken}`;
  }
  throw new Error(`No display rule for ${JSON.stringify(value)}`);
}

/** A Maestro text pattern as the literal text it asserts. */
function literal(pattern: string) {
  return pattern.replace(/(^|[^\\])\.\*/g, '$1').replace(/\\(.)/g, '$1');
}
function yamlScalar(raw: string) {
  const text = raw.trim();
  if (text.startsWith("'") && text.endsWith("'"))
    return text.slice(1, -1).replace(/''/g, "'");
  if (text.startsWith('"') && text.endsWith('"')) return JSON.parse(text);
  return text;
}

interface Check {
  file: string;
  pointer: string;
  as?: string;
  absent: boolean;
  pattern: string;
  line: number;
}
function checks(): Check[] {
  const found: Check[] = [];
  let pending: Omit<Check, 'pattern'>[] = [];
  journey.split('\n').forEach((line, index) => {
    const note =
      /^# (pointer|pointer-absent): (?:(\/[^#\s]+)#)?(\/\S*)(?: as (\S+))?$/.exec(
        line,
      );
    if (note) {
      pending.push({
        file: note[2] ?? '/discovery.json',
        pointer: note[3]!,
        as: note[4],
        absent: note[1] === 'pointer-absent',
        line: index + 1,
      });
      return;
    }
    const text =
      /^\s+text: (.+)$/.exec(line) ??
      /^- assert(?:Not)?Visible: (.+)$/.exec(line);
    if (text && pending.length) {
      for (const check of pending)
        found.push({ ...check, pattern: yamlScalar(text[1]!) });
      pending = [];
    }
  });
  if (pending.length)
    throw new Error(`Pointer without an assertion at line ${pending[0]!.line}`);
  return found;
}

test('journey 27 checks the first lead’s figures, caveats and records by JSON pointer', () => {
  const all = checks();
  const pointers = all.map((c) => c.pointer);
  // The first lead: its title, every metric, two caveats, a record and date.
  for (const pointer of [
    '/signals/0/title',
    '/signals/0/metrics/0',
    '/signals/0/metrics/1',
    '/signals/0/metrics/2',
    '/signals/0/metrics/3',
    '/signals/0/caveats/0',
    '/signals/0/caveats/2',
    '/signals/0/evidence/1/record_id',
    '/generated_at',
  ])
    expect(pointers).toContain(pointer);
  expect(all.length).toBeGreaterThanOrEqual(20);
});

test.each(checks().map((c) => [`${c.file}#${c.pointer} (line ${c.line})`, c]))(
  'pointer %s matches its assertion',
  (_name, check) => {
    const value = at(pinned(check.file), check.pointer);
    // Every pattern is a valid Maestro regular expression.
    expect(() => new RegExp(check.pattern)).not.toThrow();
    if (check.absent) {
      expect(new RegExp(check.pattern).test(String(value))).toBe(true);
      return;
    }
    expect(literal(check.pattern)).toContain(shown(value, check.as));
  },
);

test('the pointer resolver follows RFC 6901 escapes and refuses missing paths', () => {
  expect(at({ 'a/b': { '~c': [1, 2] } }, '/a~1b/~0c/1')).toBe(2);
  expect(() => at({ a: [] }, '/a/0')).toThrow('does not resolve');
  expect(() => at({ a: 1 }, 'a')).toThrow('Not a JSON pointer');
});
