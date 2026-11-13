import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  SourceAffordance,
  SourceLine,
  SourceSection,
} from '../src/design/source';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ setOptions: jest.fn() }),
}));

const line = {
  asOf: '2026-11-13',
  citation: 'OPAX daily edition',
};
const full = {
  ...line,
  originals: [{ label: 'GrantConnect', url: 'https://www.grants.gov.au/' }],
  notes: ['Program figures from GrantConnect.'],
};

function shown(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  const ids = tree.root
    .findAllByType(SourceAffordance)
    .map((node) => node.props.testID as string);
  act(() => tree.unmount());
  return ids;
}

describe('SourceSection', () => {
  test('identical lines with identical sheets show once, under the first', () => {
    expect(
      shown(
        <SourceSection>
          <SourceLine {...full} testID="a" />
          <SourceLine {...full} testID="b" />
          <SourceLine {...full} testID="c" />
        </SourceSection>,
      ),
    ).toEqual(['a']);
  });

  test('a line whose sheet holds more is never hidden behind a bare one', () => {
    // Same drawn text ("Updated 13 Nov 2026 · OPAX daily edition").
    expect(
      shown(
        <SourceSection>
          <SourceLine {...line} testID="bare" />
          <SourceLine {...full} testID="full" />
        </SourceSection>,
      ),
    ).toEqual(['bare', 'full']);
  });

  test('outside a section every line shows', () => {
    expect(
      shown(
        <>
          <SourceLine {...full} testID="a" />
          <SourceLine {...full} testID="b" />
        </>,
      ),
    ).toEqual(['a', 'b']);
  });
});
