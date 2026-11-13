import { electionMenu } from '../src/features/vic-election/actions';
import { openOnWeb } from '../src/navigation/external';
import { shareRecord, copyRecordLink } from '../src/navigation/share';
jest.mock('../src/navigation/external', () => ({ openOnWeb: jest.fn() }));
jest.mock('../src/navigation/share', () => ({
  trackShare: jest.fn(),
  shareRecord: jest.fn(),
  copyRecordLink: jest.fn(),
}));
test('menu actions use the API path and explicitly open the browser', () => {
  const menu = electionMenu(
    'Albert Park',
    'https://opax.com.au/vic-election-2026/albert-park',
  );
  menu.forEach((action) => action.onPress());
  expect(shareRecord).toHaveBeenCalledWith({
    title: 'Albert Park',
    path: '/vic-election-2026/albert-park',
  });
  expect(copyRecordLink).toHaveBeenCalledWith('/vic-election-2026/albert-park');
  expect(openOnWeb).toHaveBeenCalledWith(
    '/vic-election-2026/albert-park',
    'Albert Park',
    { preferNative: false },
  );
});
