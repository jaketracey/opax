import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatMoney, moneyAccessibilityLabel } from '../src/design/format';
import { plainCaveat } from '../src/features/leads/model';
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
// The money spec's plain-language caveats (specs/money.md 2.10): the lead
// page shows the pipeline's own caveat in these words. A caveat in pipeline
// words with no entry here has no agreed plain form for a journey to assert.
const plainCaveats: Record<string, string> = {
  'Annual party receipts are not all verified gifts; source donation_type=direct is an ingestion classification. State, election and referendum disclosures are excluded.':
    'Annual party receipts include more than gifts. State, election and referendum disclosures are not included.',
};
function plain(value: unknown): string {
  const caveat = String(value);
  if (Object.hasOwn(plainCaveats, caveat)) return plainCaveats[caveat]!;
  if (/\w_\w|ingestion/i.test(caveat))
    throw new Error(`No plain wording for ${caveat}`);
  return caveat;
}
/** A metric object's value, or the value itself. */
const amountOf = (value: unknown) =>
  Number(
    value && typeof value === 'object' && 'value' in value
      ? (value as { value: unknown }).value
      : value,
  );
/** Money read aloud in short: "77 million dollars", "2.3 billion dollars". */
function spoken(value: unknown): string {
  const amount = amountOf(value);
  if (amount < 10_000) return `${grouped(Math.round(amount))} dollars`;
  if (amount < 1e6) return `${Math.round(amount / 1e3)} thousand dollars`;
  const [unit, word] = amount < 1e9 ? [1e6, 'million'] : [1e9, 'billion'];
  return `${Number((amount / unit).toFixed(1))} ${word} dollars`;
}
function shown(value: unknown, as?: string): string {
  if (as === 'plain') return plain(value);
  if (as === 'spoken') return spoken(value);
  if (as === 'money') return `$${grouped(Math.round(amountOf(value)))}`;
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

test('journey 27 checks the leads’ titles, dates, charts and caveats by JSON pointer', () => {
  const all = checks();
  const pointers = all.map((c) => c.pointer);
  // A company lead's card (its title and one figure), its caveats and its
  // example records' originals; the export's date (a section source
  // sheet's "As at"); the party lead's takeaway, chart, table and how it
  // was found (specs/money.md 2.9, 2.10, 3).
  for (const pointer of [
    '/signals/0/title',
    '/signals/0/metrics/0',
    '/signals/0/caveats/0',
    '/signals/0/caveats/2',
    '/signals/0/evidence/0/url',
    '/signals/0/evidence/1/record_id',
    '/generated_at',
    '/signals/1/chart/participants/0/name',
    '/signals/1/chart/participants/0/value',
    '/signals/1/caveats/2',
  ])
    expect(pointers).toContain(pointer);
  expect(all.length).toBeGreaterThanOrEqual(20);
  // Every caveat is checked as the lead page shows it, in plain words.
  for (const check of all)
    if (/^\/signals\/\d+\/caveats\//.test(check.pointer) && !check.absent)
      expect(check.as).toBe('plain');
});

test('money "as spoken" and "as money" read as the app writes them', () => {
  const discovery = pinned('/discovery.json') as {
    signals: { metrics: { value: number; format: string }[] }[];
  };
  // Every money metric, read aloud as the app reads a card's figure.
  for (const signal of discovery.signals)
    for (const metric of signal.metrics.filter((m) => m.format === 'currency'))
      expect(shown(metric, 'spoken')).toBe(
        moneyAccessibilityLabel(metric.value, true),
      );
  expect(shown(at(discovery, '/signals/0/metrics/0'), 'spoken')).toBe(
    '77 million dollars',
  );
  expect(shown(124655455, 'money')).toBe(formatMoney(124655455));
  expect(shown(124655455, 'money')).toBe('$124,655,455');
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

test('a caveat "as plain" reads as the lead page shows it', () => {
  const caveats = new Set(
    (
      pinned('/discovery.json') as { signals: { caveats: string[] }[] }
    ).signals.flatMap((s) => s.caveats),
  );
  expect(caveats.size).toBeGreaterThan(1);
  // Every pinned caveat has a plain form, and it is the app's.
  for (const caveat of caveats)
    expect(shown(caveat, 'plain')).toBe(plainCaveat(caveat));
  expect(
    shown(at(pinned('/discovery.json'), '/signals/1/caveats/2'), 'plain'),
  ).toBe(
    'Annual party receipts include more than gifts. State, election and referendum disclosures are not included.',
  );
  expect(() => shown('Rows use the record_id field.', 'plain')).toThrow(
    'No plain wording',
  );
  expect(() => shown('x', 'plainly')).toThrow('Unknown pointer format');
});

test('the pointer resolver follows RFC 6901 escapes and refuses missing paths', () => {
  expect(at({ 'a/b': { '~c': [1, 2] } }, '/a~1b/~0c/1')).toBe(2);
  expect(() => at({ a: [] }, '/a/0')).toThrow('does not resolve');
  expect(() => at({ a: 1 }, 'a')).toThrow('Not a JSON pointer');
});
