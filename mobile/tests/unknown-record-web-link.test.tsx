// A universal link is claimed by its pattern (/subject/person/*) before the
// app knows whether it holds that id. The not-found page for an unknown
// person, electorate, bill, record or topic therefore offers the address on
// the website, so the link can always get back to the browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Button } from '../src/design/controls';
import { ContentUnavailable } from '../src/design/states';
import { PersonNotFound } from '../src/features/people/NotFound';
import { MissingRecord } from '../src/features/records/RecordLoadError';
import { openOnWeb } from '../src/navigation/external';
import { webFallback } from '../src/navigation/web-fallback';

jest.mock('../src/api/runtime', () => ({ apiClient: {} }));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Stack: { Screen: () => null },
  router: { canGoBack: jest.fn(), back: jest.fn(), navigate: jest.fn() },
}));
jest.mock('../src/navigation/external', () => ({
  openOnWeb: jest.fn(() => Promise.resolve()),
  openSource: jest.fn(),
  webPageUrl: jest.fn(),
}));

function render(element: React.ReactElement) {
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(element);
  });
  return view;
}
const labels = (view: TestRenderer.ReactTestRenderer) =>
  view.root.findAllByType(Button).map((button) => button.props.label);
beforeEach(() => jest.mocked(openOnWeb).mockClear());

test('the web action opens the address in the browser, never back in the app', () => {
  const action = webFallback('/subject/person/no-such', 'Person', 'x-web');
  expect(action).toMatchObject({
    label: 'Open on opax.com.au',
    testID: 'x-web',
  });
  action.onPress();
  expect(openOnWeb).toHaveBeenCalledWith('/subject/person/no-such', 'Person', {
    preferNative: false,
  });
});

test('an unavailable state draws its second action under the first', () => {
  const onPress = jest.fn();
  const view = render(
    <ContentUnavailable
      symbol="link"
      title="Title"
      action={{ label: 'Search', onPress: jest.fn() }}
      secondary={{ label: 'Open on opax.com.au', onPress, testID: 'web' }}
      testID="state"
    />,
  );
  expect(labels(view)).toEqual(['Search', 'Open on opax.com.au']);
  const web = view.root.findAllByType(Button)[1]!;
  expect(web.props).toMatchObject({ variant: 'plain', testID: 'web' });
  act(() => web.props.onPress());
  expect(onPress).toHaveBeenCalledTimes(1);
  act(() => view.unmount());
  // Without one, the state is as it was.
  const plain = render(
    <ContentUnavailable
      symbol="link"
      title="Title"
      action={{ label: 'Search', onPress: jest.fn() }}
    />,
  );
  expect(labels(plain)).toEqual(['Search']);
  act(() => plain.unmount());
});

test('an unknown person offers Search, then the website', () => {
  const view = render(
    <PersonNotFound
      onSearch={jest.fn()}
      web={webFallback('/subject/person/no-such', 'Person', 'person-web')}
    />,
  );
  expect(labels(view)).toEqual([
    'Search parliamentarians',
    'Open on opax.com.au',
  ]);
  act(() => view.root.findAllByType(Button)[1]!.props.onPress());
  expect(openOnWeb).toHaveBeenCalledWith('/subject/person/no-such', 'Person', {
    preferNative: false,
  });
  act(() => view.unmount());
});

test('a missing record offers the website on a page, not in a sheet or without an address', () => {
  const page = render(
    <MissingRecord webPath="/doc/speech-1" testID="record-error" />,
  );
  expect(labels(page)).toEqual(['Search OPAX', 'Open on opax.com.au']);
  expect(page.root.findAllByType(Button)[1]!.props.testID).toBe(
    'record-error-web',
  );
  act(() => page.unmount());
  for (const element of [
    <MissingRecord key="sheet" sheet webPath="/doc/speech-1" />,
    <MissingRecord key="none" />,
  ]) {
    const view = render(element);
    expect(labels(view)).toEqual(['Search OPAX']);
    act(() => view.unmount());
  }
});

test.each([
  ['features/Person.tsx', '`/subject/person/${encodeURIComponent(slug)}`'],
  [
    'features/Electorate.tsx',
    '`/subject/electorate/${encodeURIComponent(id)}`',
  ],
  ['features/bills/BillDetail.tsx', '`/bill/${encodeURIComponent(key)}`'],
  ['features/records/RecordLoadError.tsx', '`/doc/${slug}`'],
  ['features/reports/TopicPage.tsx', '`/subject/topic/${slug}`'],
])('%s names its own web address on its not-found page', (file, address) => {
  const source = readFileSync(join(__dirname, '../src', file), 'utf8');
  expect(source).toContain('webFallback(');
  expect(source).toContain(address);
});
