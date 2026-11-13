// A member vote row is one accessible element, so the New dot inside it is
// not read on its own: the row's label has to say it.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  combinedBills,
  MemberVoteRow,
} from '../src/features/people/MemberVoteRow';

jest.mock('../src/design/row-link', () => ({
  RowLink: ({ children }: { children: unknown }) => children,
}));

const spoken = async (isNew: boolean, href?: string) => {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      <MemberVoteRow
        position="for"
        name="Fixture Bill 2026"
        stage="Third reading"
        date="2026-10-02"
        isNew={isNew}
        testID="vote"
        {...(href ? { href: href as never } : {})}
      />,
    );
  });
  const label = view.root.find(
    (node) =>
      typeof node.type === 'string' &&
      node.props.testID === 'vote' &&
      !!node.props.accessibilityLabel,
  ).props.accessibilityLabel as string;
  await act(async () => view.unmount());
  return label;
};

test.each([undefined, '/bill/au-federal-fixture'])(
  'a new vote says New in its spoken label (href %s)',
  async (href) => {
    expect(await spoken(true, href)).toMatch(/\. New$/);
    expect(await spoken(false, href)).not.toMatch(/New/);
  },
);

// Sweep 1, item 9: a combined division leads with its first bill and names
// the second in the meta line, so it differs from its neighbour early.
const combined =
  'Fixture Amendment (Reform No. 1) Bill 2026, Fixture Rates Amendment (Reform No. 1) Bill 2026';
test('combined bills split only at top-level commas between bill titles', () => {
  expect(combinedBills(combined)).toEqual([
    'Fixture Amendment (Reform No. 1) Bill 2026',
    'Fixture Rates Amendment (Reform No. 1) Bill 2026',
  ]);
  // A comma inside a title's brackets, or a part that is not a bill, stays.
  expect(
    combinedBills('Fixture (Pensions, Work and Other Measures) Bill 2026'),
  ).toEqual(['Fixture (Pensions, Work and Other Measures) Bill 2026']);
  expect(combinedBills('Motion to suspend, Fixture Bill 2026')).toEqual([
    'Motion to suspend, Fixture Bill 2026',
  ]);
});
test('a combined division draws its first bill and "with" the second', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      <MemberVoteRow
        position="for"
        name={`${combined}, Fixture Levy Bill 2026`}
        stage="Third reading"
        date="2026-06-04"
        href={'/bill/au-federal-fixture' as never}
        testID="vote"
      />,
    );
  });
  const drawn = view.root
    .findAll((node) => node.type === 'Text')
    .map((node) => ([] as unknown[]).concat(node.props.children).join(''));
  expect(drawn).toContain('Fixture Amendment (Reform No. 1) Bill 2026');
  expect(drawn).toContain(
    'Third reading · with Fixture Rates Amendment (Reform No. 1) and 1 more · 4 Jun 2026',
  );
  const label = view.root.find(
    (node) => typeof node.type === 'string' && node.props.testID === 'vote',
  ).props.accessibilityLabel as string;
  // VoiceOver still hears every bill's full title.
  expect(label).toContain(`${combined}, Fixture Levy Bill 2026`);
  await act(async () => view.unmount());
});
