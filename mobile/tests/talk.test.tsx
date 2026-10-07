import { act, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import TestRenderer from 'react-test-renderer';
import * as voice from '../src/voice';
import * as bridge from '../src/features/talk/bridge';
import { useTalk } from '../src/features/talk/useTalk';
import {
  applyEvent,
  emptySnapshot,
  endCopy,
  failureCopy,
  recoverSnapshot,
  refusal,
} from '../src/features/talk/model';
import {
  failures,
  endReasons,
  type VoiceEvent,
  type VoiceSnapshot,
  type VoiceStatus,
} from '../src/voice/types';
import { recordDestination } from '../src/features/talk/sources';

jest.mock('../src/voice', () => ({
  subscribe: jest.fn(),
  status: jest.fn(),
  snapshot: jest.fn(),
  start: jest.fn(),
  end: jest.fn(),
  mute: jest.fn(),
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
test('refocusing a retained sheet clears pending controls and rejects its old subscription', async () => {
  mockBridge.readConsent.mockResolvedValue(true);
  await mount();
  const pending = deferred<voice.VoiceResult<void>>();
  mockVoice.start.mockReturnValueOnce(pending.promise);
  let starting!: Promise<void>;
  act(() => {
    starting = call.start();
  });
  expect(call.busy).toBe(true);
  const oldListener = listener;
  act(() => mockFocus.cleanup?.());
  await act(async () => {
    mockFocus.cleanup = mockFocus.effect?.();
  });
  expect(call.busy).toBe(false);
  expect(call.consentLoaded).toBe(true);
  act(() =>
    oldListener({
      type: 'transcript',
      turns: [{ role: 'user', id: 99, text: 'Old sheet words' }],
    }),
  );
  expect(call.snapshot.transcript).toEqual([]);
  await act(async () => {
    pending.resolve(ok);
    await starting;
  });
  expect(call.busy).toBe(false);
  expect(mockVoice.start).toHaveBeenCalledTimes(1);
  expect(mockVoice.end).toHaveBeenCalledTimes(1);
});
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
// The call screen shows one short sentence and one action for each state.
const short = (copy: string) => {
  expect(copy).toMatch(/^[A-Z].{9,}[.]$/);
  expect(copy.length).toBeLessThanOrEqual(64);
};
test.each(failures)('one specific short sentence for refusal %s', (reason) => {
  short(failureCopy[reason]);
  expect(
    Object.values(failureCopy).filter((copy) => copy === failureCopy[reason]),
  ).toHaveLength(1);
});
test.each(endReasons)(
  'one specific short sentence for terminal reason %s, saying the microphone is off',
  (reason) => {
    short(endCopy[reason]);
    expect(endCopy[reason]).toMatch(/ Microphone off[.]$/);
    expect(
      Object.values(endCopy).filter((copy) => copy === endCopy[reason]),
    ).toHaveLength(1);
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
  ).toBe('callOpen');
  expect(refusal(null)).toBeNull();
});
