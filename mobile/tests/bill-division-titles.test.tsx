import { act } from 'react';
import { useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import * as d from '../src/api/catalogs';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import BillDetail from '../src/features/bills/BillDetail';
import {
  divisionQuestion,
  divisionTitle,
  questionBlocks,
  questionPlain,
  stageTitle,
} from '../src/features/bills/divisions';
import { bills, pinned, replaceAt, slugs } from './pinned';

// Design review D5: a division is titled by its recorded stage. The bills
// export now writes it as an optional `title` (docs/BILLS-CONTRACT.md); the
// pinned files predate it, so this fixture adds one to a pinned division.
const PATH = '/bills/au-federal-r7534.json';
const raw = pinned(PATH) as { divisions: { stage: string | null }[] };
const titled = replaceAt(
  raw,
  ['divisions', 0, 'title'],
  'Limitation of debate',
);

const mockParams: { key: string; section?: string } = {
  key: 'au-federal-r7534',
};
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), navigate: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { billFor: jest.fn(), directory: jest.fn() },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('the bill decoder and a division title', () => {
  test('reads an exported title and keeps a bill without one as it was', () => {
    const bill = d.decodeBill(titled);
    expect(bill.divisions[0]!.title).toBe('Limitation of debate');
    expect(bill.divisions[1]!.title).toBeUndefined();
    const plain = d.decodeBill(raw);
    expect(plain.divisions.every((x) => x.title === undefined)).toBe(true);
    // The view's rows carry it through to the screen.
    const rows = d.billFor(bill, bills).divisions.data!.rows;
    expect(rows.find((r) => r.key === bill.divisions[0]!.key)!.title).toBe(
      'Limitation of debate',
    );
  });

  test('a blank or malformed title is dropped, never a reason to reject the bill', () => {
    for (const value of ['', '   ', 42, null, { text: 'x' }]) {
      const bill = d.decodeBill(
        replaceAt(raw, ['divisions', 0, 'title'], value),
      );
      expect(bill.divisions[0]!.title).toBeUndefined();
      expect(bill.divisions).toHaveLength(raw.divisions.length);
    }
    expect(
      d.decodeBill(
        replaceAt(raw, ['divisions', 0, 'title'], '  Third reading '),
      ).divisions[0]!.title,
    ).toBe('Third reading');
  });
});

describe('division titles', () => {
  test('the export’s stage titles, ported (export_bills.division_title)', () => {
    const cases: [string | null, string | null][] = [
      ['Second reading', 'Second reading'],
      ['THIRD READING', 'Third reading'],
      ['First Reading', 'First reading'],
      ['Committee of the Whole', 'Committee of the whole'],
      ['Consideration in Detail', 'Consideration in detail'],
      [
        'Motion to Suspend Standing Orders',
        'Motion to suspend standing orders',
      ],
      ['Report from Federation Chamber', 'Report from Federation Chamber'],
      ['Second Reading – Increase Jobseeker Payment', 'Second reading'],
      ['  Third\n reading  ', 'Third reading'],
      ['Motion', 'Motion'],
      ['Unfamiliar recorded stage', 'Unfamiliar recorded stage'],
      ['', null],
      [null, null],
    ];
    for (const [stage, title] of cases) expect(stageTitle(stage)).toBe(title);
  });

  test('the export’s title, then the recorded stage, then the motion, then "Division"', () => {
    expect(
      divisionTitle({
        title: 'Third reading',
        stage: 'In committee',
        head: 'x',
      }),
    ).toBe('Third reading');
    expect(
      divisionTitle({ title: undefined, stage: 'in committee', head: 'x' }),
    ).toBe('In committee');
    expect(
      divisionTitle({ title: ' ', stage: null, head: 'That the bill pass.' }),
    ).toBe('That the bill pass.');
    expect(divisionTitle({ stage: null, head: '' })).toBe('Division');
  });

  test('a division named "Motions - <bill> - …" is titled Motion and keeps only its motion', () => {
    // The pinned Stop PEP11 bill (directory fixture): build 32 drew its one
    // division as "s - Offshore Petroleum … Bill 2023...".
    const bill = {
      title:
        'Offshore Petroleum and Greenhouse Gas Storage Amendment (Stop PEP11 and Protect Our Coast) Bill 2023',
    };
    const question =
      'Motions - Offshore Petroleum and Greenhouse Gas Storage Amendment (Stop Pep11 and Protect Our Coast) Bill 2023 - Consider bill now';
    expect(stageTitle('Motion')).toBe('Motion');
    expect(divisionQuestion(question, 'Motion', bill)).toBe(
      'Consider bill now',
    );
    // A stage is only removed as a whole word.
    expect(divisionQuestion('Motions are in order.', 'Motion', bill)).toBe(
      'Motions are in order.',
    );
    expect(
      divisionQuestion(
        'Second reading - That the bill be read.',
        'Second reading',
        bill,
      ),
    ).toBe('That the bill be read.');
    // A placeholder is no question.
    expect(divisionQuestion('Long debate text truncated.', null, bill)).toBe(
      '',
    );
  });
});

describe('division question Markdown', () => {
  test('flattened headings and quotes come back as blocks', () => {
    expect(
      questionBlocks('### Motion text > *That the question be now put.*'),
    ).toEqual([
      { kind: 'heading', lines: [[{ text: 'Motion text' }]] },
      {
        kind: 'quote',
        blocks: [
          {
            kind: 'paragraph',
            lines: [
              [{ text: 'That the question be now put.', emphasis: true }],
            ],
          },
        ],
      },
    ]);
  });

  // Emphasis wrapped around a whole link arrives unpaired in the source, so
  // the repair drops it (web billNoteRepair): the link keeps plain weight.
  test('links resolve against They Vote For You; escapes stay their characters', () => {
    const [block] = questionBlocks(
      'Moved \\_\\_\\_ see the _[policy](/policies/21)_ and **[the debate](https://www.openaustralia.org.au/debates/?id=1)**, **firmly**.',
    );
    expect(block).toEqual({
      kind: 'paragraph',
      lines: [
        [
          { text: 'Moved ___ see the ' },
          { text: 'policy', url: 'https://theyvoteforyou.org.au/policies/21' },
          { text: ' and ' },
          {
            text: 'the debate',
            url: 'https://www.openaustralia.org.au/debates/?id=1',
          },
          { text: ', ' },
          { text: 'firmly', strong: true },
          { text: '.' },
        ],
      ],
    });
  });

  test('markup in the source is text: nothing becomes a link but http(s)', () => {
    const plain = questionPlain(
      'A [script](javascript:alert(1)) and <b>bold</b> and [mail](mailto:x@y.z).',
    );
    expect(plain).toBe('A script and <b>bold</b> and mail.');
    const links = questionBlocks(
      'A [script](javascript:alert(1)) and [mail](mailto:x@y.z).',
    ).flatMap((b) =>
      b.kind === 'paragraph' ? b.lines.flat().filter((r) => r.url) : [],
    );
    expect(links).toEqual([]);
  });

  test('every pinned division question reads without raw Markdown marks', () => {
    const bill = d.decodeBill(raw);
    for (const division of bill.divisions) {
      const text = divisionQuestion(division.question, division.stage, bill);
      const plain = questionPlain(text);
      expect(plain).not.toMatch(/(^|\s)#{1,3}\s|(^|\s)>\s|\]\(|\*\*/);
    }
  });
});

describe('the bill page draws the exported title', () => {
  const fixture = new Catalogs({
    get: async (path, decode) => ({
      data: decode(
        path === '/api/person-slugs'
          ? slugs
          : path === PATH
            ? titled
            : pinned(path),
      ),
      stale: false,
      savedAt: 1000,
      asOf: null,
    }),
  });
  beforeEach(async () => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    jest
      .mocked(runtime.billFor)
      .mockResolvedValue(await fixture.billFor(mockParams.key));
  });
  const byID = (root: ReactTestInstance, testID: string) =>
    root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === testID,
    );
  const texts = (root: ReactTestInstance): string[] =>
    root.children.flatMap((child) =>
      typeof child === 'string' ? [child] : texts(child),
    );

  test('each division leads with its outcome, then its title, chamber and date, then three parties', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<BillDetail />);
    });
    const view = (await fixture.billFor(mockParams.key)).data;
    const row = view.divisions.data!.rows[0]!;
    expect(row.title).toBe('Limitation of debate');
    const item = byID(r.root, 'bill-division-0')[0]!;
    expect(texts(byID(item, 'bill-division-0-title')[0]!)).toEqual([
      'Limitation of debate',
    ]);
    expect(texts(item)).toContain('Senate · 19 Aug 2026');
    expect(
      byID(item, 'bill-division-0-outcome')[0]!.props.accessibilityLabel,
    ).toBe('Negatived, 11 ayes, 24 noes');
    // Three parties drawn; the rest and the question wait behind one row.
    const splits = byID(item, 'bill-division-0-splits')[0]!;
    expect(
      splits.findAll(
        (node) =>
          typeof node.type === 'string' &&
          typeof node.props.accessibilityLabel === 'string',
      ),
    ).toHaveLength(3);
    const more = byID(item, 'bill-division-0-more')[0]!;
    expect(more.props.accessibilityState).toEqual({ expanded: false });
    expect(more.props.accessibilityLabel).toMatch(
      /^The question, \d+ words, \d+ more parties$/,
    );
    expect(byID(item, 'bill-division-0-question')).toHaveLength(0);
    const toggle = item.find(
      (node) =>
        node.props.testID === 'bill-division-0-more' &&
        typeof node.props.onPress === 'function',
    );
    act(() => toggle.props.onPress());
    const question = byID(r.root, 'bill-division-0-question')[0]!;
    expect(texts(question).join('')).toMatch(
      /^Sue Lines Pursuant to the order/,
    );
    act(() => r.unmount());
  });
});
