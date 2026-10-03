import native, { type NativeVoice } from '../modules/opax-voice';
import * as voice from '../src/voice';
import {
  mapChallenge as voiceMappingChallenge,
  mapEvent,
  mapResult,
  mapStatus,
} from '../src/voice/mapping';
jest.mock('../modules/opax-voice', () => ({
  __esModule: true,
  default: {
    status: jest.fn(),
    snapshot: jest.fn(),
    requestCode: jest.fn(),
    consumeCode: jest.fn(),
    start: jest.fn(),
    mute: jest.fn(),
    end: jest.fn(),
    logout: jest.fn(),
    requestDeletionCode: jest.fn(),
    deleteAccount: jest.fn(),
    addListener: jest.fn(),
  },
}));
const mockNative = native as jest.Mocked<NativeVoice>;
const status = {
  enabled: true,
  signedIn: true,
  unlimited: false,
  totalSeconds: 600,
  remainingSeconds: 480,
  activeSession: null,
  budgetOpen: null,
};
const challenge = { sent: true, challengeId: 'c'.repeat(43) };
beforeEach(() => jest.clearAllMocks());
test('every JS command calls the native API with exact arguments and typed results', async () => {
  mockNative.status.mockResolvedValue({ ok: true, value: status });
  mockNative.requestCode.mockResolvedValue({ ok: true, value: challenge });
  mockNative.consumeCode.mockResolvedValue({ ok: true, value: status });
  mockNative.requestDeletionCode.mockResolvedValue({
    ok: true,
    value: challenge,
  });
  mockNative.deleteAccount.mockResolvedValue({
    ok: true,
    value: { deleted: true, signedOut: true },
  });
  for (const command of ['start', 'mute', 'end', 'logout'] as const)
    mockNative[command].mockResolvedValue({ ok: true, value: null });
  expect(await voice.status()).toEqual({ ok: true, value: status });
  expect(await voice.requestCode('synthetic@example.invalid')).toEqual({
    ok: true,
    value: challenge,
  });
  expect(mockNative.requestCode).toHaveBeenCalledWith(
    'synthetic@example.invalid',
  );
  expect(await voice.consumeCode(challenge.challengeId, '01234567')).toEqual({
    ok: true,
    value: status,
  });
  expect(mockNative.consumeCode).toHaveBeenCalledWith(
    challenge.challengeId,
    '01234567',
  );
  for (const command of [voice.start, voice.mute, voice.end, voice.logout])
    expect(await command()).toEqual({ ok: true, value: undefined });
  expect(mockNative.mute).toHaveBeenCalledWith(true);
  await voice.mute(false);
  expect(mockNative.mute).toHaveBeenLastCalledWith(false);
  expect(await voice.requestDeletionCode()).toEqual({
    ok: true,
    value: challenge,
  });
  expect(await voice.deleteAccount(challenge.challengeId, '01234567')).toEqual({
    ok: true,
    value: { deleted: true, signedOut: true },
  });
  expect(mockNative.deleteAccount).toHaveBeenCalledWith(
    challenge.challengeId,
    '01234567',
  );
});
test('native exceptions and error prose never enter JS results', async () => {
  mockNative.status.mockRejectedValue(new Error('sensitive provider payload'));
  expect(await voice.status()).toEqual({ ok: false, error: 'unavailable' });
  mockNative.status.mockResolvedValue({
    ok: false,
    error: 'signedOut',
    message: 'private',
    token: 'secret',
  });
  expect(await voice.status()).toEqual({ ok: false, error: 'signedOut' });
  mockNative.status.mockResolvedValue({ ok: false, error: 'provider secret' });
  expect(await voice.status()).toEqual({ ok: false, error: 'invalidResponse' });
});
test('projects status without session ID or credential even with hostile extra fields', () => {
  const result = mapStatus({
    ...status,
    token: 'private',
    activeSession: {
      id: 'session',
      state: 'active',
      expiresAt: 1700000000,
      signedURL: 'private',
    },
  });
  expect(result.activeSession).toEqual({
    state: 'active',
    expiresAt: 1700000000,
  });
  expect(JSON.stringify(result)).not.toMatch(/private|session|signedURL|token/);
  expect(
    mapResult(
      { ok: true, value: { ...challenge, cookie: 'private' } },
      (value) => voiceMappingChallenge(value),
    ),
  ).toEqual({ ok: true, value: challenge });
});
test.each([
  { type: 'state', state: 'ended', reason: 'allowanceExhausted' },
  { type: 'mode', mode: 'muted' },
  { type: 'playback', playback: 'truncated' },
  { type: 'remainingTime', seconds: 4 },
  { type: 'error', error: 'deletionVerificationFailed' },
  { type: 'status', status },
  {
    type: 'transcript',
    turns: [{ role: 'agent', id: 1, text: 'Synthetic correction' }],
  },
  {
    type: 'sources',
    sources: [{ title: 'Published record', path: '/bill/au-federal-r7534' }],
  },
])('maps sanitised event $type and removes unrelated fields', (event) => {
  expect(
    mapEvent({
      ...event,
      audio: 'private',
      credential: 'private',
      session_id: 'private',
    }),
  ).toEqual(event);
});
test.each([
  { type: 'audio', audio: 'private' },
  { type: 'error', error: 'private' },
  { type: 'remainingTime', seconds: -1 },
  { type: 'state', state: 'invented', reason: null },
  { type: 'transcript', turns: [{ role: 'provider', id: 1, text: 'text' }] },
  {
    type: 'sources',
    sources: [{ title: 'bad', path: '//foreign.example/doc/x' }],
  },
  {
    type: 'sources',
    sources: [{ title: 'bad', path: '/api/voice/connect?session_id=private' }],
  },
  { type: 'sources', sources: [{ title: 'bad', path: '/doc/%0A' }] },
  { type: 'status', status: { ...status, remainingSeconds: '480' } },
])('drops malformed or non-public events', (event) =>
  expect(mapEvent(event)).toBeNull(),
);
test('subscription filters payloads and cancels the native listener', () => {
  const remove = jest.fn();
  let callback: (value: unknown) => void = () => {};
  mockNative.addListener.mockImplementation((_name, listener) => {
    callback = listener;
    return { remove };
  });
  const listener = jest.fn();
  const unsubscribe = voice.subscribe(listener);
  expect(mockNative.addListener).toHaveBeenCalledWith(
    'onVoiceEvent',
    expect.any(Function),
  );
  callback({ type: 'audio', audio: 'private' });
  callback({ type: 'mode', mode: 'listening' });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith({ type: 'mode', mode: 'listening' });
  unsubscribe();
  expect(remove).toHaveBeenCalledTimes(1);
});

const snapshot = {
  state: 'live',
  reason: null,
  mode: 'muted',
  playback: 'flowing',
  remaining: 120,
  transcript: [{ role: 'agent', id: 1, text: 'Synthetic transcript' }],
  sources: [{ title: 'Public record', path: '/money/receipts' }],
  status,
};
test('snapshot resynchronises a remounted listener and projects only public fields', async () => {
  mockNative.snapshot.mockResolvedValue({
    ok: true,
    value: {
      ...snapshot,
      audio: 'secret',
      credential: 'secret',
      sessionId: 'secret',
      serverText: 'secret',
      transcript: snapshot.transcript.map((t) => ({ ...t, audio: 'secret' })),
      sources: snapshot.sources.map((s) => ({ ...s, signedURL: 'secret' })),
    },
  });
  expect(await voice.snapshot()).toEqual({ ok: true, value: snapshot });
  expect(mockNative.snapshot).toHaveBeenCalledWith();
});
test.each([
  { ...snapshot, state: 'private' },
  { ...snapshot, mode: 'private' },
  { ...snapshot, reason: 'private' },
  { ...snapshot, playback: 'private' },
  { ...snapshot, remaining: -1 },
  {
    ...snapshot,
    transcript: [{ role: 'agent', id: 1, text: 'x'.repeat(24001) }],
  },
  {
    ...snapshot,
    sources: [{ title: 'bad', path: '/api/voice/connect?session_id=private' }],
  },
  { ...snapshot, status: { ...status, remainingSeconds: 'bad' } },
])('snapshot rejects malformed fields as invalidResponse', async (value) => {
  mockNative.snapshot.mockResolvedValue({ ok: true, value });
  expect(await voice.snapshot()).toEqual({
    ok: false,
    error: 'invalidResponse',
  });
});
test('idle snapshot supports absent status and mode', async () => {
  const value = {
    ...snapshot,
    state: 'idle',
    mode: null,
    status: null,
    remaining: 0,
    transcript: [],
    sources: [],
  };
  mockNative.snapshot.mockResolvedValue({ ok: true, value });
  expect(await voice.snapshot()).toEqual({ ok: true, value });
});
