// A member vote row is one accessible element, so the New dot inside it is
// not read on its own: the row's label has to say it.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { MemberVoteRow } from '../src/features/people/MemberVoteRow';

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
