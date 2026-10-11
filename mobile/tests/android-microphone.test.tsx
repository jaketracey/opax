import { act, useEffect } from 'react';
import {
  AppState,
  PermissionsAndroid,
  Platform,
  type AppStateStatus,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import Constants from 'expo-constants';
import * as voice from '../src/voice';
import * as bridge from '../src/features/talk/bridge';
import { useTalk } from '../src/features/talk/useTalk';
import type { VoiceEvent, VoiceStatus } from '../src/voice/types';
import { emptySnapshot } from '../src/features/talk/model';

// Android's microphone permission (src/voice/README.md, "Android microphone
// permission"): asked by Talk on Start only, after consent and a rationale;
// `voice.start()` only once it is granted. Never at launch.
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
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(effect, [effect]);
  },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));
// The build's embedded config, which a test switches between builds.
const mockExtra = Constants.expoConfig!.extra! as Record<string, unknown>;

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
const ok = { ok: true, value: undefined } as const;
const { GRANTED, DENIED, NEVER_ASK_AGAIN } = PermissionsAndroid.RESULTS;
let check: jest.SpyInstance;
let request: jest.SpyInstance;
let lifecycle: (state: AppStateStatus) => void;
let call!: ReturnType<typeof useTalk>;
let renderer: TestRenderer.ReactTestRenderer;
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
const original = Platform.OS;
const asPlatform = (os: 'android' | 'ios') =>
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  asPlatform('android');
  mockExtra.productionVoiceEnabled = true;
  let listener: (event: VoiceEvent) => void = () => {};
  mockVoice.subscribe.mockImplementation((fn) => {
    listener = fn;
    return jest.fn();
  });
  mockVoice.status.mockImplementation(async () => {
    listener({ type: 'status', status });
    return { ok: true, value: status };
  });
  mockVoice.snapshot.mockResolvedValue({
    ok: true,
    value: { ...emptySnapshot, state: 'ready', status },
  });
  mockVoice.start.mockResolvedValue(ok);
  mockVoice.end.mockResolvedValue(ok);
  mockBridge.readConsent.mockResolvedValue(true);
  mockBridge.setConsent.mockResolvedValue(true);
  mockBridge.background.mockResolvedValue();
  check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  request = jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(GRANTED);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, fn) => {
    lifecycle = fn;
    return { remove: jest.fn() };
  });
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  jest.restoreAllMocks();
  asPlatform(original as 'ios');
  delete mockExtra.productionVoiceEnabled;
});

test('opening Talk never asks for the microphone', async () => {
  await mount();
  expect(check).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(call.microphone).toBeNull();
});

test('without stored consent, Start asks nothing and starts nothing', async () => {
  mockBridge.readConsent.mockResolvedValue(false);
  await mount();
  await act(async () => {
    await call.start();
  });
  expect(call.error).toBe('consentRequired');
  expect(check).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(mockVoice.start).not.toHaveBeenCalled();
});

test('consent, then the rationale, then the system dialog, then the call', async () => {
  mockBridge.readConsent.mockResolvedValue(false);
  await mount();
  await act(async () => {
    await call.agreeAndStart();
  });
  // Agreement is stored before the microphone is mentioned.
  expect(mockBridge.setConsent).toHaveBeenCalledWith(true);
  expect(mockBridge.setConsent.mock.invocationCallOrder[0]).toBeLessThan(
    check.mock.invocationCallOrder[0]!,
  );
  expect(call.microphone).toBe('rationale');
  expect(request).not.toHaveBeenCalled();
  expect(mockVoice.start).not.toHaveBeenCalled();
  await act(async () => {
    await call.allowMicrophone();
  });
  expect(request).toHaveBeenCalledWith(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );
  expect(request.mock.invocationCallOrder[0]).toBeLessThan(
    mockVoice.start.mock.invocationCallOrder[0]!,
  );
  expect(mockVoice.start).toHaveBeenCalledTimes(1);
  expect(call.microphone).toBeNull();
});

test('already granted: Start goes straight to the call, with no dialog', async () => {
  check.mockResolvedValue(true);
  await mount();
  await act(async () => {
    await call.start();
  });
  expect(request).not.toHaveBeenCalled();
  expect(mockVoice.start).toHaveBeenCalledTimes(1);
});

test('Not now leaves the microphone alone', async () => {
  await mount();
  await act(async () => {
    await call.start();
  });
  expect(call.microphone).toBe('rationale');
  act(() => call.declineMicrophone());
  expect(call.microphone).toBeNull();
  expect(request).not.toHaveBeenCalled();
  expect(mockVoice.start).not.toHaveBeenCalled();
});

test('denied: no call, status is read again, and Start asks again', async () => {
  request.mockResolvedValue(DENIED);
  await mount();
  await act(async () => {
    await call.start();
  });
  const reads = mockVoice.status.mock.calls.length;
  await act(async () => {
    await call.allowMicrophone();
  });
  expect(call.microphone).toBe('denied');
  expect(mockVoice.start).not.toHaveBeenCalled();
  expect(mockVoice.status.mock.calls.length).toBe(reads + 1);
  await act(async () => {
    await call.start();
  });
  expect(call.microphone).toBe('rationale');
});

test('the dialog’s pause and resume neither end nor refresh anything', async () => {
  const answer = deferred<string>();
  request.mockReturnValue(answer.promise);
  await mount();
  await act(async () => {
    await call.start();
  });
  const reads = mockVoice.status.mock.calls.length;
  let asking!: Promise<void>;
  act(() => {
    asking = call.allowMicrophone();
  });
  // React Native reports the resume before the permission answer arrives.
  await act(async () => lifecycle('background'));
  await act(async () => lifecycle('active'));
  expect(mockBridge.background).not.toHaveBeenCalled();
  expect(mockVoice.status.mock.calls.length).toBe(reads);
  await act(async () => {
    answer.resolve(GRANTED);
    await asking;
  });
  expect(mockVoice.start).toHaveBeenCalledTimes(1);
  // A real background afterwards still reaches the native lifecycle.
  await act(async () => lifecycle('background'));
  expect(mockBridge.background).toHaveBeenCalledTimes(1);
});

test('“Don’t ask again” leads to Settings, and access turned on there clears it', async () => {
  request.mockResolvedValue(NEVER_ASK_AGAIN);
  await mount();
  await act(async () => {
    await call.start();
  });
  await act(async () => {
    await call.allowMicrophone();
  });
  expect(call.microphone).toBe('blocked');
  // Android would answer at once without a dialog: no second rationale.
  await act(async () => {
    await call.start();
  });
  expect(call.microphone).toBe('blocked');
  expect(request).toHaveBeenCalledTimes(1);
  check.mockResolvedValue(true);
  await act(async () => lifecycle('active'));
  expect(call.microphone).toBeNull();
  await act(async () => {
    await call.start();
  });
  expect(mockVoice.start).toHaveBeenCalledTimes(1);
});

test.each([
  ['Android e2e and development', 'android', undefined],
  ['iOS, where native start() asks', 'ios', true],
] as const)(
  '%s never touch the Android permission API',
  async (_name, os, voiceSwitch) => {
    asPlatform(os);
    if (voiceSwitch === undefined) delete mockExtra.productionVoiceEnabled;
    await mount();
    await act(async () => {
      await call.start();
    });
    expect(check).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(call.microphone).toBeNull();
    expect(mockVoice.start).toHaveBeenCalledTimes(1);
  },
);
