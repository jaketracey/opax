import { mockVic, renderVic, resetVic, words } from './vic-election-render';
import { ElectionSearchRow } from '../src/features/vic-election/SearchRow';
beforeEach(resetVic);
test('Browse and folded election words open the published hub', () => {
  expect(words(renderVic(<ElectionSearchRow />))).toContain(
    'Find your district and its candidates',
  );
  expect(words(renderVic(<ElectionSearchRow q="Élection" />))).toContain(
    'Victorian election 2026 · 28 November',
  );
  expect(words(renderVic(<ElectionSearchRow q="parliament" />))).toBe('');
});
test('Search retires after 28 December and hides on withdrawal', () => {
  mockVic.now = new Date('2026-12-29T00:00:00+11:00');
  expect(words(renderVic(<ElectionSearchRow />))).toBe('');
  resetVic();
  mockVic.overview = {
    record: null,
    error: new Error('withdrawn'),
    loading: false,
  };
  expect(words(renderVic(<ElectionSearchRow />))).toBe('');
});
