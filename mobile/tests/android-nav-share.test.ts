import { OpaxShare } from '../modules/opax-share';
import { defaultOptions } from '../src/features/ask/model';
import { shareRecord } from '../src/navigation/share';

jest.mock('../src/design/environment', () => ({
  ...jest.requireActual('../src/design/environment'),
  isE2E: false,
  webOrigin: 'https://opax.com.au',
}));
jest.mock('../modules/opax-share', () => ({
  OpaxShare: { share: jest.fn(async () => true) },
}));
jest.mock('../src/design/haptics', () => ({ haptic: jest.fn() }));

afterEach(() => jest.clearAllMocks());

test.each([
  ['/bill/au-federal-r7534', 'Bill'],
  ['/doc/speech-1205524', 'Speech'],
  ['/subject/person/fixture-member', 'Member'],
  ['/explore?game=tm', 'Time machine'],
])(
  'share forwards the canonical URL and loaded title for %s',
  async (path, title) => {
    await shareRecord({ path, title });
    expect(OpaxShare!.share).toHaveBeenCalledWith({
      url: `https://opax.com.au${path}`,
      title,
    });
  },
);

test('share preserves quiz text beside its canonical URL', async () => {
  await shareRecord({
    path: '/explore?game=quiz',
    title: 'The record quiz',
    text: 'A result from the public record.',
  });
  expect(OpaxShare!.share).toHaveBeenCalledWith({
    url: 'https://opax.com.au/explore?game=quiz',
    title: 'The record quiz',
    text: 'A result from the public record.',
  });
});

test('question shares include the question and selected public filters', async () => {
  await shareRecord({
    path: '/ask',
    title: 'Question',
    question: {
      text: 'Public services?',
      options: { ...defaultOptions, kind: 'speech', topic: 'services' },
    },
  });
  expect(OpaxShare!.share).toHaveBeenCalledWith({
    url: 'https://opax.com.au/ask?q=Public+services%3F&kind=speech&topic=services',
    title: 'Question',
  });
});

test('share preserves a reviewed section anchor', async () => {
  await shareRecord({
    path: '/subject/topic/services',
    title: 'Services',
    anchor: 'records',
  });
  expect(OpaxShare!.share).toHaveBeenCalledWith({
    url: 'https://opax.com.au/subject/topic/services#records',
    title: 'Services',
  });
});
