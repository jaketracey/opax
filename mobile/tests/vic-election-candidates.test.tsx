import { Text as NativeText } from 'react-native';
import { mockVic, renderVic, resetVic, words } from './vic-election-render';
import { PartyLabel } from '../src/design/people';
import { Candidates } from '../src/features/vic-election/Candidates';
import { decodeSeat } from '../src/features/vic-election/decoders';
import region from '../scripts/fixtures/vic-election/southern-metropolitan.json';
import published from '../scripts/fixtures/vic-election/albert-park-candidates.json';

beforeEach(resetVic);
function renderCandidates(list: unknown[]) {
  mockVic.seat.record!.data = decodeSeat({
    ...region,
    candidates: { ...published.candidates, list },
  });
  return renderVic(
    <Candidates
      record={mockVic.seat.record!}
      o={mockVic.overview.record!.data}
      now={mockVic.now}
    />,
  );
}
function row(r: ReturnType<typeof renderVic>, i: number) {
  return r.root
    .findAllByProps({ testID: `vic-seat-candidate-${i}` })
    .find((n) => typeof n.type === 'string')!;
}
test('Council groups retain ballot order, with headings instead of global numbers', () => {
  const r = renderCandidates([
    {
      name: 'Test Zed',
      party: 'Example Party',
      group: 'A',
      group_name: 'Example Group',
    },
    {
      name: 'Test Ada',
      party: 'Example Party',
      group: 'A',
      group_name: 'Example Group',
    },
    { name: 'Test Wren', party: 'Independent', group: 'M', group_name: null },
    { name: 'Test Rowan', party: null, group: null, group_name: null },
    { name: 'Test Avery', party: 'Independent', group: '', group_name: '' },
  ]);
  const text = words(r);
  const ordered = [
    'Group A · Example Group',
    'Test Zed',
    'Test Ada',
    'Group M',
    'Test Wren',
    'Ungrouped candidates',
    'Test Rowan',
    'Test Avery',
  ];
  for (let i = 1; i < ordered.length; i++)
    expect(text.indexOf(ordered[i - 1]!)).toBeLessThan(
      text.indexOf(ordered[i]!),
    );
  const headings = r.root
    .findAllByType(NativeText)
    .filter((n) => n.props.accessibilityRole === 'header')
    .map((n) => n.props.children);
  expect(headings).toEqual([
    'Candidates',
    'Group A · Example Group',
    'Group M',
    'Ungrouped candidates',
  ]);
  expect(row(r, 0).props.accessibilityLabel).toBe(
    'Group A · Example Group. Test Zed, Example Party.',
  );
  expect(row(r, 3).props.accessibilityLabel).toBe(
    'Ungrouped candidates. Test Rowan.',
  );
  expect(row(r, 3).findAllByType(PartyLabel)).toHaveLength(0);
  expect(row(r, 4).props.accessibilityLabel).toBe(
    'Ungrouped candidates. Test Avery.',
  );
  expect(row(r, 4).findAllByType(PartyLabel)).toHaveLength(0);
  for (let i = 0; i < 5; i++) {
    expect(row(r, i).props.onPress).toBeUndefined();
    expect(
      row(r, i)
        .findAllByType(NativeText)
        .some((n) => n.props.children === i + 1),
    ).toBe(false);
  }
});
test('an all-ungrouped Council list has one heading and no ballot numbers', () => {
  const r = renderCandidates([
    { name: 'Test Rowan', party: null, group: null, group_name: null },
  ]);
  expect(words(r)).toContain('Ungrouped candidates');
  expect(row(r, 0).props.accessibilityLabel).toBe(
    'Ungrouped candidates. Test Rowan.',
  );
});
test('older Council responses without group metadata are a plain unnumbered list', () => {
  const r = renderCandidates(published.candidates.list);
  expect(row(r, 0).props.accessibilityLabel).toBe(
    `${published.candidates.list[0]!.name}.`,
  );
  expect(words(r)).not.toContain('Ungrouped candidates');
  for (let i = 0; i < published.candidates.list.length; i++)
    expect(
      row(r, i)
        .findAllByType(NativeText)
        .some((n) => n.props.children === i + 1),
    ).toBe(false);
});
test('a Council list with no group fields never gains a number or group heading', () => {
  const r = renderCandidates([{ name: 'Test Rowan', party: null }]);
  expect(row(r, 0).props.accessibilityLabel).toBe('Test Rowan.');
  expect(
    row(r, 0)
      .findAllByType(NativeText)
      .some((n) => n.props.children === 1),
  ).toBe(false);
  expect(
    r.root
      .findAllByType(NativeText)
      .filter((n) => n.props.accessibilityRole === 'header'),
  ).toHaveLength(1);
});
test('districts keep visible ballot numbers and independent names have no party label', () => {
  mockVic.seat.record!.data = decodeSeat(published);
  const r = renderVic(
    <Candidates
      record={mockVic.seat.record!}
      o={mockVic.overview.record!.data}
      now={mockVic.now}
    />,
  );
  expect(row(r, 0).props.accessibilityLabel).toBe(
    `${1}. ${published.candidates.list[0]!.name}.`,
  );
  expect(
    row(r, 0)
      .findAllByType(NativeText)
      .some((n) => n.props.children === 1),
  ).toBe(true);
  expect(row(r, 1).findAllByType(PartyLabel)).toHaveLength(0);
  expect(row(r, 1).props.accessibilityLabel).toBe(
    `2. ${published.candidates.list[1]!.name}.`,
  );
});
