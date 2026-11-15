import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs } from '../src/api/runtime';
import { useSavedDirectory } from '../src/features/today/saved-directory';

jest.mock('../src/api/runtime', () => ({
  catalogs: { directorySaved: jest.fn() },
}));

const read = jest.mocked(catalogs.directorySaved);
const first = { saved: 'first' } as never;
const second = { saved: 'second' } as never;

const seen: unknown[] = [];
function Probe({ wanted, resolved }: { wanted: boolean; resolved: boolean }) {
  seen.push(useSavedDirectory(wanted, resolved));
  return null;
}
const last = () => seen[seen.length - 1];

beforeEach(() => {
  seen.length = 0;
  read.mockReset();
});

test('the read starts on mount, before it is known to be wanted, and is shown only when wanted', async () => {
  read.mockResolvedValue(first);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Probe wanted={false} resolved={false} />);
  });
  expect(read).toHaveBeenCalledTimes(1);
  expect(last()).toBeNull();
  // Wanted once the launch reads answer: already at hand, with no wait.
  seen.length = 0;
  await act(async () => r.update(<Probe wanted resolved={false} />));
  expect(seen).toEqual([first]);
  expect(read).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

test('the saved copy is let go once the seat has resolved, and is not shown again', async () => {
  read.mockResolvedValueOnce(first);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Probe wanted resolved={false} />);
  });
  expect(last()).toBe(first);
  // The seat resolves.
  await act(async () => r.update(<Probe wanted={false} resolved />));
  expect(last()).toBeNull();
  // The seat is read again (a retry): the copy from before the seat
  // resolved is gone, the page holds nothing for the new disk read, and
  // that read's answer is the one shown.
  let answer!: (value: never) => void;
  read.mockReturnValueOnce(
    new Promise((resolve) => {
      answer = resolve;
    }) as never,
  );
  seen.length = 0;
  await act(async () => r.update(<Probe wanted resolved={false} />));
  expect(seen).not.toContain(first);
  expect(last()).toBeNull();
  await act(async () => answer(second));
  expect(last()).toBe(second);
  expect(read).toHaveBeenCalledTimes(2);
  act(() => r.unmount());
});

test('a disk that cannot answer is "none saved": the page is not held', async () => {
  read.mockRejectedValue(new Error('unreadable'));
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Probe wanted resolved={false} />);
  });
  expect(seen[0]).toBeUndefined();
  expect(last()).toBeNull();
  act(() => r.unmount());
});
