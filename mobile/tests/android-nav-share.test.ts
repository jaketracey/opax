import { OpaxShare } from '../modules/opax-share';
import { defaultOptions } from '../src/features/ask/model';
import { Alert } from 'react-native';
import { shareRecord, shareSource } from '../src/navigation/share';

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

describe('a cited source', () => {
  test('with an OPAX page shares that canonical page', async () => {
    await shareSource(
      { href: '/doc/speech-123', slug: 'speech-123', url: 'https://x.example' },
      'A speech',
    );
    expect(OpaxShare!.share).toHaveBeenCalledWith({
      url: 'https://opax.com.au/doc/speech-123',
      title: 'A speech',
    });
  });

  test('with only a slug shares its record page', async () => {
    await shareSource({ href: '', slug: 'speech-9' }, 'A speech');
    expect(OpaxShare!.share).toHaveBeenCalledWith({
      url: 'https://opax.com.au/doc/speech-9',
      title: 'A speech',
    });
  });

  test("with only its publisher's page shares that address", async () => {
    const url = 'https://publisher.example/report';
    await shareSource({ href: url, slug: '', url }, 'A report');
    expect(OpaxShare!.share).toHaveBeenCalledWith({
      url,
      title: 'A report',
      text: 'A report',
      external: true,
    });
  });

  test.each([
    { href: '', slug: '' },
    { href: 'http://publisher.example/a', slug: '' },
    { href: 'javascript:alert(1)', slug: '' },
  ])('with no shareable address says so: %j', async (source) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await shareSource(source, 'A report');
    expect(OpaxShare!.share).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Couldn’t share this link');
    alert.mockRestore();
  });
});

test('a path that is not on the public site says so instead of doing nothing', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await expect(
    shareRecord({ path: 'https://publisher.example/a', title: 'A report' }),
  ).resolves.toBeUndefined();
  await shareRecord({ path: '', title: 'A report' });
  expect(OpaxShare!.share).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledTimes(2);
  expect(alert).toHaveBeenLastCalledWith('Couldn’t share this link');
  alert.mockRestore();
});
