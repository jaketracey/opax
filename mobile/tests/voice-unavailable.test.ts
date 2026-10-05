import * as voice from '../src/voice';
jest.mock('../modules/opax-voice', () => ({ __esModule: true, default: null }));
test('every API degrades to a typed unavailable result without a native module', async () => {
  for (const call of [
    voice.snapshot,
    voice.status,
    voice.start,
    voice.mute,
    voice.end,
    voice.logout,
    voice.requestDeletionCode,
    () => voice.requestCode('synthetic@example.invalid'),
    () => voice.consumeCode('c'.repeat(43), '01234567'),
    () => voice.deleteAccount('c'.repeat(43), '01234567'),
  ]) {
    expect(await call()).toEqual({ ok: false, error: 'unavailable' });
  }
  const listener = jest.fn();
  expect(() => voice.subscribe(listener)()).not.toThrow();
  expect(listener).not.toHaveBeenCalled();
});
