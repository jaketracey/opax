import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { CitedRecordRow, sourceRoute } from '../src/features/ask/AskRows';
import { openAnswerLink } from '../src/features/ask/AnswerBody';
import { recordDestination } from '../src/features/talk/sources';
import { TalkRecordScreen } from '../src/features/talk/RecordScreen';
import ReportScreen from '../src/features/reports/ReportScreen';
import { reportRoute } from '../src/navigation/routes/records';
import { isCurrentRecord } from '../src/navigation/record-link';
import type { Source } from '../src/features/ask/model';
import royal from './fixtures/reports/royal.json';
jest.mock('../src/api/runtime', () => ({}));
jest.mock('../src/features/reports/ReportScreen', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/features/talk/live', () => ({
  useTalkLive: () => ({
    active: true,
    status: 'Listening',
    phase: 'listening',
    end: jest.fn(),
  }),
}));
jest.mock('../src/features/talk/useVoiceLevels', () => ({
  useVoiceLevels: () => ({}),
}));
jest.mock('../src/features/talk/VoiceOrb', () => ({ VoiceOrb: () => null }));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => ({
    path: '/report/royal-commission-cth-robodebt',
  }),
  router: { push: jest.fn() },
  Redirect: () => null,
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
const path = `/report/${royal.slug}`;
const source: Source = {
  title: royal.title,
  slug: royal.slug,
  href: path,
  resource: '',
  snippet: '',
  cited: true,
};
test('Ask citations and inline answer links resolve to the native report', async () => {
  expect(sourceRoute(source)).toEqual(reportRoute(royal.slug));
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <CitedRecordRow record={source} n={1} testID="report-citation" />,
    );
  });
  const row = tree.root.findAll(
    (n) => n.props.testID === 'report-citation' && n.props.onAccessibilityTap,
  )[0]!;
  await act(async () => row.props.onAccessibilityTap());
  expect(router.push).toHaveBeenCalledWith(reportRoute(royal.slug));
  openAnswerLink(path);
  expect(router.push).toHaveBeenLastCalledWith(reportRoute(royal.slug));
});
test('Talk citations open the native report inside the live call', async () => {
  expect(recordDestination(path)).toEqual(reportRoute(royal.slug));
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<TalkRecordScreen />);
  });
  expect(tree.root.findByType(ReportScreen).props).toMatchObject({
    recordSlug: royal.slug,
    embedded: true,
  });
});
test('invalid report links never become native routes and a focused report is not pushed twice', () => {
  expect(recordDestination('/report/constructor')).toBeNull();
  expect(recordDestination('/report/annual-report-a/b')).toBeNull();
  expect(
    isCurrentRecord(reportRoute(royal.slug), {
      routes: [{ name: 'report/[slug]', params: { slug: royal.slug } }],
    }),
  ).toBe(true);
  expect(
    isCurrentRecord(reportRoute(royal.slug), {
      routes: [
        { name: 'report/[slug]', params: { slug: 'annual-report-other' } },
      ],
    }),
  ).toBe(false);
});
