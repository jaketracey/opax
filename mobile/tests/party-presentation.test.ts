import {
  afterPartyFrame,
  createPartyPresentation,
} from '../src/features/people/party-presentation';

let next = 0;
const frames = new Map<number, FrameRequestCallback>();
beforeEach(() => {
  next = 0;
  frames.clear();
  jest
    .spyOn(globalThis, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      frames.set(++next, callback);
      return next;
    });
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    if (id != null) frames.delete(id);
  });
});
afterEach(() => jest.restoreAllMocks());
function frame() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(0));
}

test('optional work waits until the core has had two native frame turns', async () => {
  const work = jest.fn();
  const pending = afterPartyFrame().then(work);
  expect(work).not.toHaveBeenCalled();
  frame();
  await Promise.resolve();
  expect(work).not.toHaveBeenCalled();
  frame();
  await pending;
  expect(work).toHaveBeenCalledTimes(1);
});

test('native title layout precedes the two frame turns, even when the repository publishes early', async () => {
  const presentation = createPartyPresentation();
  const work = jest.fn();
  const pending = presentation.afterFrame().then(work);
  frame();
  frame();
  expect(frames.size).toBe(0);
  expect(work).not.toHaveBeenCalled();
  presentation.didLayout();
  await Promise.resolve();
  await Promise.resolve();
  frame();
  expect(work).not.toHaveBeenCalled();
  frame();
  await pending;
  expect(work).toHaveBeenCalledTimes(1);
});

test('leaving before title layout rejects the wait without starting optional work', async () => {
  const presentation = createPartyPresentation();
  const controller = new AbortController();
  const pending = presentation.afterFrame(controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  presentation.didLayout();
  await Promise.resolve();
  expect(frames.size).toBe(0);
});

test('leaving after the first frame cancels optional work and its pending frame', async () => {
  const controller = new AbortController();
  const work = jest.fn();
  const pending = afterPartyFrame(controller.signal).then(work);
  frame();
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(frames.size).toBe(0);
  frame();
  expect(work).not.toHaveBeenCalled();
});

test('an already cancelled screen schedules no frames', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(afterPartyFrame(controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(frames.size).toBe(0);
});
