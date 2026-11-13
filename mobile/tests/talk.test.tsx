import { act, useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import TestRenderer from 'react-test-renderer';
import * as voice from '../src/voice';
import * as bridge from '../src/features/talk/bridge';
import { useTalk } from '../src/features/talk/useTalk';
import {
  applyEvent,
  emptySnapshot,
  endCopy,
  eventFailure,
  failureCopy,
  recoverSnapshot,
  refusal,
  sendFailure,
} from '../src/features/talk/model';
import {
  callStates,
  failures,
  endReasons,
  type VoiceEvent,
  type VoiceSnapshot,
  type VoiceStatus,
} from '../src/voice/types';
import { recordDestination } from '../src/features/talk/sources';
import { track } from '../src/analytics';

jest.mock('../src/voice', () => ({
  subscribe: jest.fn(),
  status: jest.fn(),
  snapshot: jest.fn(),
  start: jest.fn(),
  end: jest.fn(),
  mute: jest.fn(),
}));
jest.mock('../src/analytics', () => ({
  ...jest.requireActual('../src/analytics'),
  track: jest.fn(),
}));
jest.mock('../src/features/talk/bridge', () => ({
  discardEvidence: jest.fn(),
  readConsent: jest.fn(),
  setConsent: jest.fn(),
  background: jest.fn(),
  sendText: jest.fn(),
}));
const mockFocus: {
  effect?: () => void | (() => void);
  cleanup?: void | (() => void);
} = {};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual<typeof import('react')>('react').useEffect(() => {
      mockFocus.effect = effect;
      mockFocus.cleanup = effect();
      return () => mockFocus.cleanup?.();
    }, [effect]);
  },
}));
const mockVoice = jest.mocked(voice);
const mockBridge = jest.mocked(bridge);
const status: VoiceStatus = {
  enabled: true,
  signedIn: true,
  unlimited: false,
  totalSeconds: 600,
  remainingSeconds: 600,
  activeSession: null,
  budgetOpen: true,
};
const ready: VoiceSnapshot = { ...emptySnapshot, state: 'ready', status };
const ok = { ok: true, value: undefined } as const;
function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let listener: (event: VoiceEvent) => void;
let call!: ReturnType<typeof useTalk>;
let renderer: TestRenderer.ReactTestRenderer;
let unsubscribe: jest.Mock;
function Probe() {
  const value = useTalk();
  useEffect(() => {
    call = value;
  }, [value]);
  return null;
}
async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(<Probe />);
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  unsubscribe = jest.fn();
  mockVoice.subscribe.mockImplementation((fn) => {
    listener = fn;
    return unsubscribe;
  });
  mockVoice.status.mockImplementation(async () => {
    listener({ type: 'status', status });
    return { ok: true, value: status };
  });
  mockVoice.snapshot.mockResolvedValue({ ok: true, value: ready });
  mockVoice.start.mockResolvedValue(ok);
  mockVoice.end.mockResolvedValue(ok);
  mockVoice.mute.mockResolvedValue(ok);
  mockBridge.readConsent.mockResolvedValue(false);
  mockBridge.setConsent.mockResolvedValue(true);
  mockBridge.background.mockResolvedValue();
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  jest.restoreAllMocks();
});
test('subscribe precedes status and atomic recovery, and consent is never automatic', async () => {
  await mount();
  expect(mockVoice.subscribe.mock.invocationCallOrder[0]).toBeLessThan(
    mockVoice.status.mock.invocationCallOrder[0]!,
  );
  expect(mockVoice.status.mock.invocationCallOrder[0]).toBeLessThan(
    mockVoice.snapshot.mock.invocationCallOrder[0]!,
  );
  expect(call.consent).toBe(false);
  expect(mockBridge.setConsent).not.toHaveBeenCalled();
  await act(async () => {
    await call.start();
  });
  expect(call.error).toBe('consentRequired');
  expect(mockVoice.start).not.toHaveBeenCalled();
});
test('newer caption correction and cleared allowance win over pending snapshot per field', async () => {
  const pending = deferred<voice.VoiceResult<VoiceSnapshot>>();
  mockVoice.snapshot.mockReturnValue(pending.promise);
  await mount();
  act(() => {
    listener({
      type: 'transcript',
      turns: [{ role: 'agent', id: 1, text: 'Corrected words' }],
    });
    listener({ type: 'status', status: null });
  });
  await act(async () => {
    pending.resolve({
      ok: true,
      value: {
        ...ready,
        state: 'live',
        transcript: [{ role: 'agent', id: 1, text: 'Old words' }],
      },
    });
  });
  expect(call.snapshot.state).toBe('live');
  expect(call.snapshot.transcript[0]?.text).toBe('Corrected words');
  expect(call.snapshot.status).toBeNull();
});
test('explicit agreement persists before starting; failed storage never starts', async () => {
  await mount();
  mockBridge.setConsent.mockResolvedValueOnce(false);
  await act(async () => {
    await call.agreeAndStart();
  });
  expect(mockVoice.start).not.toHaveBeenCalled();
  await act(async () => {
    await call.agreeAndStart();
  });
  expect(mockBridge.setConsent).toHaveBeenLastCalledWith(true);
  expect(mockVoice.start).toHaveBeenCalledTimes(1);
});
test('withdrawal uses the native consent dependency; a new start requires agreement again', async () => {
  mockBridge.readConsent.mockResolvedValue(true);
  await mount();
  await act(async () => {
    await call.changeConsent(false);
  });
  expect(mockBridge.setConsent).toHaveBeenCalledWith(false);
  expect(call.consent).toBe(false);
  await act(async () => {
    await call.start();
  });
  expect(mockVoice.start).not.toHaveBeenCalled();
});
test('End cancels a pending Start, with no blind retry', async () => {
  mockBridge.readConsent.mockResolvedValue(true);
  await mount();
  const pending = deferred<voice.VoiceResult<void>>();
  mockVoice.start.mockReturnValueOnce(pending.promise);
  let starting!: Promise<void>;
  act(() => {
    starting = call.start();
  });
  await act(async () => {
    await call.end();
  });
  expect(mockVoice.end).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve(ok);
    await starting;
  });
  expect(mockVoice.start).toHaveBeenCalledTimes(1);
});

test('an old Start acknowledgement cannot clear a newer dispatch or restore its error after End', async () => {
  mockBridge.readConsent.mockResolvedValue(true);
  await mount();
  const first = deferred<voice.VoiceResult<void>>(),
    second = deferred<voice.VoiceResult<void>>();
  mockVoice.start
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  let starting!: Promise<void>, restarting!: Promise<void>;
  act(() => {
    starting = call.start();
  });
  await act(async () => {
    await call.end();
  });
  act(() => {
    restarting = call.start();
  });
  expect(call.busy).toBe(true);
  await act(async () => {
    first.resolve({ ok: false, error: 'microphoneDenied' });
    await starting;
  });
  expect(call.error).toBeNull();
  expect(call.busy).toBe(true);
  await act(async () => {
    second.resolve(ok);
    await restarting;
  });
  expect(call.busy).toBe(false);
  expect(mockVoice.start).toHaveBeenCalledTimes(2);
});
test('a push inside Talk keeps the call: blur neither ends nor unsubscribes, and refocus rereads consent', async () => {
  mockBridge.readConsent.mockResolvedValue(true);
  await mount();
  const pending = deferred<voice.VoiceResult<void>>();
  mockVoice.start.mockReturnValueOnce(pending.promise);
  let starting!: Promise<void>;
  act(() => {
    starting = call.start();
  });
  expect(call.busy).toBe(true);
  // The Sources sheet or a record is pushed, then popped.
  act(() => mockFocus.cleanup?.());
  expect(unsubscribe).not.toHaveBeenCalled();
  expect(mockVoice.end).not.toHaveBeenCalled();
  await act(async () => {
    mockFocus.cleanup = mockFocus.effect?.();
  });
  expect(call.consentLoaded).toBe(true);
  act(() =>
    listener({
      type: 'transcript',
      turns: [{ role: 'user', id: 7, text: 'Still talking' }],
    }),
  );
  expect(call.snapshot.transcript).toEqual([
    { role: 'user', id: 7, text: 'Still talking' },
  ]);
  await act(async () => {
    pending.resolve(ok);
    await starting;
  });
  expect(call.busy).toBe(false);
  expect(mockVoice.start).toHaveBeenCalledTimes(1);
  expect(mockVoice.end).not.toHaveBeenCalled();
});
test('consent stored by the sheet starts the call without asking again', async () => {
  await mount();
  expect(call.consent).toBe(false);
  await act(async () => {
    await call.startConsented();
  });
  expect(call.consent).toBe(true);
  expect(mockVoice.start).toHaveBeenCalledTimes(1);
  expect(mockBridge.setConsent).not.toHaveBeenCalled();
});
test.each(['android', 'ios'] as const)(
  '%s handles Agree during the return-to-Talk status refresh',
  async (os) => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    try {
      await mount();
      const pending = deferred<voice.VoiceResult<VoiceStatus>>();
      mockVoice.status.mockReturnValueOnce(pending.promise);
      mockBridge.readConsent.mockResolvedValue(true);
      act(() => {
        mockFocus.cleanup = mockFocus.effect?.();
      });
      let starting!: Promise<void>;
      await act(async () => {
        starting = call.startConsented();
      });
      expect(mockVoice.start).toHaveBeenCalledTimes(os === 'android' ? 0 : 1);
      await act(async () => {
        pending.resolve({ ok: true, value: status });
        await starting;
      });
      expect(mockVoice.start).toHaveBeenCalledTimes(1);
      expect(call.consent).toBe(true);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: original,
      });
    }
  },
);
test('inactive does not end; background delegates a specific reason; foreground refreshes and recovers', async () => {
  let lifecycle!: (state: AppStateStatus) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, fn) => {
    lifecycle = fn;
    return { remove: jest.fn() };
  });
  await mount();
  act(() => lifecycle('inactive'));
  expect(mockBridge.background).not.toHaveBeenCalled();
  expect(mockVoice.end).not.toHaveBeenCalled();
  await act(async () => lifecycle('background'));
  expect(mockBridge.background).toHaveBeenCalledTimes(1);
  await act(async () => lifecycle('active'));
  expect(mockVoice.status).toHaveBeenCalledTimes(2);
  expect(mockVoice.snapshot).toHaveBeenCalledTimes(2);
});
test("the microphone prompt's inactive round trip keeps a denial on screen", async () => {
  let lifecycle!: (state: AppStateStatus) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, fn) => {
    lifecycle = fn;
    return { remove: jest.fn() };
  });
  const started = deferred<Awaited<ReturnType<typeof mockVoice.start>>>();
  mockVoice.start.mockReturnValueOnce(started.promise);
  await mount();
  let pending!: Promise<unknown>;
  act(() => {
    pending = call.startConsented();
  });
  act(() => lifecycle('inactive'));
  await act(async () => {
    started.resolve({ ok: false, error: 'microphoneDenied' });
    await pending;
  });
  expect(call.error).toBe('microphoneDenied');
  await act(async () => lifecycle('active'));
  expect(call.error).toBe('microphoneDenied');
  expect(mockVoice.status).toHaveBeenCalledTimes(1);
});
test('leaving unsubscribes, ends and clears transient captions; remount reads a new snapshot', async () => {
  await mount();
  act(() =>
    listener({
      type: 'transcript',
      turns: [{ role: 'user', id: 1, text: 'Transient' }],
    }),
  );
  act(() => renderer.unmount());
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(mockVoice.end).toHaveBeenCalledTimes(1);
  await mount();
  expect(mockVoice.snapshot).toHaveBeenCalledTimes(2);
  expect(call.snapshot.transcript).toEqual([]);
});
test('failed fresh status invalidates cached allowance', async () => {
  await mount();
  mockVoice.status.mockResolvedValueOnce({ ok: false, error: 'network' });
  await act(async () => {
    await call.refresh();
  });
  expect(call.snapshot.status).toBeNull();
  expect(call.error).toBe('network');
});
test('captions are replaced, not appended, and source navigation is guarded again', () => {
  const next = applyEvent(
    { ...ready, transcript: [{ role: 'agent', id: 1, text: 'Old' }] },
    {
      type: 'transcript',
      turns: [{ role: 'agent', id: 1, text: 'Correction' }],
    },
  );
  expect(next.transcript).toEqual([
    { role: 'agent', id: 1, text: 'Correction' },
  ]);
  expect(recordDestination('/bill/au-federal-r7534')).toEqual({
    pathname: '/bill/[key]',
    params: { key: 'au-federal-r7534' },
  });
  expect(recordDestination('/doc/speech-1205524')).toEqual({
    pathname: '/doc/[slug]',
    params: { slug: 'speech-1205524' },
  });
  expect(recordDestination('/bill/au-federal-r7534#bill-full-text')).toEqual({
    pathname: '/bill-text/[key]',
    params: { key: 'au-federal-r7534' },
  });
  for (const path of [
    'https://attacker.invalid/bill/x',
    '//attacker.invalid/bill/x',
    '/api/voice/start',
    '/ask',
    '/bill/x?ask=1',
    '/bill/x#token=secret',
  ])
    expect(recordDestination(path)).toBeNull();
  expect(
    recoverSnapshot(ready, { ...ready, remaining: 50 }, new Set(['status'])),
  ).toEqual({ ...ready, remaining: 50 });
});
// The call screen shows one plain sentence and one action for each state
// (specs/account.md 7.6): technical failures share a sentence, and none says
// "Microphone off": the system indicator already shows it.
const plain = (copy: string) => {
  expect(copy).toMatch(/^[A-Z].{9,}[.…]$/);
  expect(copy.length).toBeLessThanOrEqual(72);
  expect(copy).not.toMatch(/Microphone off/);
};
test.each(failures)('one plain sentence for refusal %s', (reason) => {
  plain(failureCopy[reason]);
});
test('connection failures, and other voice faults, each share one sentence', () => {
  for (const reason of [
    'network',
    'timeout',
    'policy',
    'invalidResponse',
    'cancelled',
  ] as const)
    expect(failureCopy[reason]).toBe(
      'Couldn’t connect. Check your connection and try again.',
    );
  for (const reason of [
    'forbidden',
    'unavailable',
    'unsupportedFormat',
    'queueOverflow',
    'deletionVerificationFailed',
  ] as const)
    expect(failureCopy[reason]).toBe(
      'Something went wrong with voice. Try again.',
    );
});
test.each(endReasons)(
  'one plain sentence for terminal reason %s, never saying the microphone is off',
  (reason) => {
    plain(endCopy[reason]);
  },
);
test('allowance and unknown budget are taken from status, never inferred from a close', () => {
  expect(refusal({ ...status, remainingSeconds: 0 })).toBe(
    'allowanceExhausted',
  );
  expect(refusal({ ...status, budgetOpen: false })).toBe('budgetClosed');
  expect(
    refusal({
      ...status,
      unlimited: true,
      remainingSeconds: 0,
      budgetOpen: null,
    }),
  ).toBeNull();
  expect(refusal({ ...status, enabled: false, signedIn: false })).toBe(
    'disabled',
  );
  expect(
    refusal({
      ...status,
      remainingSeconds: 0,
      budgetOpen: false,
      activeSession: { state: 'active', expiresAt: null },
    }),
  ).toBe('allowanceExhausted');
  expect(refusal(null)).toBeNull();
});
test('an open session never refuses Start: the server takes the earlier call over', () => {
  for (const state of ['reserved', 'connecting', 'active'] as const)
    expect(
      refusal({ ...status, activeSession: { state, expiresAt: null } }),
    ).toBeNull();
  const open = { state: 'active' as const, expiresAt: 1234 };
  expect(refusal({ ...status, enabled: false, activeSession: open })).toBe(
    'disabled',
  );
  expect(refusal({ ...status, signedIn: false, activeSession: open })).toBe(
    'signedOut',
  );
  expect(refusal({ ...status, budgetOpen: false, activeSession: open })).toBe(
    'budgetClosed',
  );
  // A 409 from Start is the one place callOpen is said.
  expect(failureCopy.callOpen).toBe(
    'Your earlier call is still ending. Try again in a minute.',
  );
});

describe('call analytics', () => {
  const sent = () =>
    jest
      .mocked(track)
      .mock.calls.filter(([event]) => event === 'opax_talk')
      .map(([, properties]) => properties);
  const state = (value: VoiceEvent & { type: 'state' }) =>
    act(() => listener(value));
  let now = 0;
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockBridge.readConsent.mockResolvedValue(true);
  });

  test('a Start that goes live sends call_started, then its length and reason once', async () => {
    await mount();
    await act(async () => {
      await call.start();
    });
    // Commands only acknowledge: nothing is sent until the call is live.
    expect(sent()).toEqual([]);
    state({ type: 'state', state: 'connecting', reason: null });
    state({ type: 'state', state: 'live', reason: null });
    now += 95_600;
    state({ type: 'state', state: 'ended', reason: 'network' });
    state({ type: 'state', state: 'ended', reason: 'network' });
    expect(sent()).toEqual([
      { action: 'call_started', account: 'signed_in' },
      {
        action: 'call_ended',
        account: 'signed_in',
        duration_s: 96,
        end_reason: 'network',
      },
    ]);
  });

  test('a refused Start is one call_failed with its coarse reason', async () => {
    mockVoice.start.mockResolvedValueOnce({
      ok: false,
      error: 'allowanceExhausted',
    });
    await mount();
    await act(async () => {
      await call.start();
    });
    expect(sent()).toEqual([
      { action: 'call_failed', account: 'signed_in', end_reason: 'limit' },
    ]);
    // The same refusal arriving as an event is the same attempt.
    act(() => listener({ type: 'error', error: 'allowanceExhausted' }));
    expect(sent()).toHaveLength(1);
  });

  test('leaving Talk mid-call ends it as the reader’s choice, capped at ten minutes', async () => {
    await mount();
    await act(async () => {
      await call.start();
    });
    state({ type: 'state', state: 'live', reason: null });
    now += 3_600_000;
    act(() => renderer.unmount());
    expect(sent()).toEqual([
      { action: 'call_started', account: 'signed_in' },
      {
        action: 'call_ended',
        account: 'signed_in',
        duration_s: 600,
        end_reason: 'user',
      },
    ]);
  });

  test('a 409 at Start is one call_failed, beside its call-still-ending line', async () => {
    await mount();
    // Row 118's 409: the server ends native's attempt while it reserves.
    mockVoice.start.mockImplementationOnce(async () => {
      listener({ type: 'state', state: 'reserving', reason: null });
      listener({ type: 'state', state: 'ending', reason: null });
      listener({ type: 'error', error: 'callOpen' });
      listener({ type: 'state', state: 'failed', reason: 'failed' });
      return ok;
    });
    await act(async () => {
      await call.start();
    });
    expect(call.error).toBe('callOpen');
    expect(sent()).toEqual([
      { action: 'call_failed', account: 'signed_in', end_reason: 'limit' },
    ]);
  });

  test('a call this screen did not start sends nothing', async () => {
    await mount();
    state({ type: 'state', state: 'live', reason: null });
    state({ type: 'state', state: 'ended', reason: 'user' });
    expect(sent()).toEqual([]);
  });
});

// Native says callOpen for three things; Talk gives the last
// two their own lines and keeps the call-still-ending line for the 409.
describe('callOpen in Talk words', () => {
  const state = (
    value: VoiceSnapshot['state'],
    reason: null | 'failed' = null,
  ) => listener({ type: 'state', state: value, reason });
  test('a 409 from Start keeps the call-still-ending line', async () => {
    mockBridge.readConsent.mockResolvedValue(true);
    await mount();
    mockVoice.start.mockImplementationOnce(async () => {
      // Native's attempt: the server's 409 ends it, so it arrives while ending.
      state('checking');
      state('reserving');
      state('ending');
      listener({ type: 'error', error: 'callOpen' });
      state('failed', 'failed');
      return ok;
    });
    await act(async () => {
      await call.start();
    });
    expect(call.error).toBe('callOpen');
    expect(failureCopy[call.error!]).toBe(
      'Your earlier call is still ending. Try again in a minute.',
    );
  });
  test('Start during a call says so, and the line lapses when that call moves on', async () => {
    mockBridge.readConsent.mockResolvedValue(true);
    await mount();
    act(() => state('live'));
    // Native refuses Start with callOpen and leaves the call as it was.
    mockVoice.start.mockImplementationOnce(async () => {
      listener({ type: 'error', error: 'callOpen' });
      return ok;
    });
    await act(async () => {
      await call.start();
    });
    expect(mockVoice.start).toHaveBeenCalledTimes(1);
    expect(call.error).toBe('alreadyInCall');
    expect(failureCopy[call.error!]).toBe('You’re already in a call.');
    // It must not outlive the call as the screen's message once it ends.
    act(() => state('ending'));
    expect(call.error).toBeNull();
  });
  test('only a call being set up or live turns callOpen into already in a call', () => {
    const underWay = ['checking', 'reserving', 'connecting', 'live'];
    for (const value of callStates)
      expect([value, eventFailure('callOpen', value)]).toEqual([
        value,
        underWay.includes(value) ? 'alreadyInCall' : 'callOpen',
      ]);
    expect(eventFailure('network', 'live')).toBe('network');
    plain(failureCopy.alreadyInCall);
    plain(failureCopy.notLive);
  });
  test('text sent once the call is no longer live has its own line, which stays after the call ends', async () => {
    mockBridge.readConsent.mockResolvedValue(true);
    await mount();
    act(() => state('live'));
    mockBridge.sendText.mockResolvedValueOnce({ ok: false, error: 'callOpen' });
    let sent: Awaited<ReturnType<typeof call.send>>;
    await act(async () => {
      sent = await call.send('Which bills passed?');
    });
    // The composer keeps the text: the result is still a failure.
    expect(sent!).toEqual({ ok: false, error: 'callOpen' });
    expect(call.error).toBe('notLive');
    expect(failureCopy[call.error!]).toBe(
      'The call ended before your message was sent.',
    );
    act(() => state('ended'));
    expect(call.error).toBe('notLive');
    // Other send failures keep their own words.
    mockBridge.sendText.mockResolvedValueOnce({ ok: false, error: 'network' });
    await act(async () => {
      await call.send('Again');
    });
    expect(call.error).toBe('network');
    expect(sendFailure('callOpen')).toBe('notLive');
    expect(sendFailure('queueOverflow')).toBe('queueOverflow');
  });
});
