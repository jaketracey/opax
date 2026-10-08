import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { DocumentAsk, documentQuestion } from '../src/features/ask/DocumentAsk';
import { topics } from '../src/features/ask/Options';
import { titleSubject } from '../src/features/records/citations';
import { decodeDocument } from '../src/features/records/model';
import fixtures from '../scripts/fixtures/records/contracts.json';

jest.mock('expo-router', () => ({
  router: { dismissTo: jest.fn(), navigate: jest.fn() },
  useSegments: () => ['(tabs)', '(today)', 'doc', '[slug]'],
}));
const source = readFileSync(
  resolve(__dirname, '../../portal/public/app.js'),
  'utf8',
);
const functionStart = source.indexOf('function docAskQuestion(');
const functionEnd = source.indexOf(
  '// Preserve the source verbatim',
  functionStart,
);
const webQuestion = runInNewContext(
  `${source.slice(functionStart, functionEnd)}; docAskQuestion`,
  { TOPICS: topics, titleSubject },
) as (doc: unknown, debate: string, isRecord: boolean) => string;
const documents = Object.entries(fixtures.responses)
  .filter(([path]) => path.startsWith('/api/resource/'))
  .map(([, response]) => decodeDocument(response));
const speech = documents.find((doc) => doc.labels.kind === 'speech')!;

test.each(documents)('document draft mirrors the web for $slug', (doc) => {
  const debate = String(
    doc.metadata.topic ||
      doc.metadata.debate ||
      (doc.speaker ? titleSubject(doc) : ''),
  );
  const isRecord = [
    'press_release',
    'bill_text',
    'grant_invitation',
    'grant_award',
    'election_baseline',
    'parliamentary_profile',
    'research_report',
  ].includes(doc.labels.kind || '');
  expect(documentQuestion(doc)).toBe(webQuestion(doc, debate, isRecord));
});

test.each([
  { ...speech, topics: ['unknown', 'housing'] },
  { ...speech, topics: [], metadata: { topic: 'Bills' }, title: 'Bills' },
  {
    ...speech,
    topics: [],
    metadata: { debate: 'Housing Bill — Second reading' },
  },
  {
    ...speech,
    topics: [],
    metadata: { topic: 'A long subject '.repeat(12) },
  },
])('generic, staged, labelled and long subjects retain web wording', (doc) => {
  const debate = String(doc.metadata.topic || doc.metadata.debate || '');
  expect(documentQuestion(doc)).toBe(webQuestion(doc, debate, false));
});

test('mount does nothing; tapping opens a draft without submitting or creating a speaker profile', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(<DocumentAsk doc={speech} />);
  });
  expect(router.navigate).not.toHaveBeenCalled();
  await act(async () => {
    view.root.findByProps({ testID: 'doc-ask' }).props.onPress();
  });
  // From a browsing tab the draft opens by navigating to the Ask tab
  // (tests/ask-entry-navigation.test.tsx drives the real router).
  expect(router.dismissTo).not.toHaveBeenCalled();
  expect(router.navigate).toHaveBeenCalledTimes(1);
  expect(router.navigate).toHaveBeenCalledWith({
    pathname: '/(tabs)/(ask)/ask',
    params: { question: documentQuestion(speech), entry: expect.any(String) },
  });
  await act(async () => view.unmount());
});
