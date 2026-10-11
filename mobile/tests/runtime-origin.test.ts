// Review P3-1: the Android e2e build's origin is the emulator's host alias,
// 10.0.2.2. On a phone that is an ordinary local-network address, so the JS
// runtime refuses it unless OpaxVoice reports the emulator board, as the voice
// module's own e2e guard does.
type Load = {
  os: 'android' | 'ios';
  origin: string;
  voice: { e2eOnEmulator?: boolean } | null;
};

function load({ os, origin, voice }: Load) {
  let error: unknown = null;
  jest.isolateModules(() => {
    const { Platform } = jest.requireActual('react-native');
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra: {
            variant: 'e2e',
            apiOrigin: origin,
            appVersion: '1.0.0',
            appBuild: '1',
          },
        },
      },
    }));
    jest.doMock('../modules/opax-voice', () => ({
      __esModule: true,
      default: voice,
    }));
    try {
      jest.requireActual('../src/api/runtime');
    } catch (thrown) {
      error = thrown;
    }
  });
  return error;
}

afterEach(() => {
  jest.dontMock('expo-constants');
  jest.dontMock('../modules/opax-voice');
});

const fixture = 'http://10.0.2.2:8961';

test('the Android emulator reaches the fixture through its host alias', () => {
  expect(
    load({ os: 'android', origin: fixture, voice: { e2eOnEmulator: true } }),
  ).toBeNull();
});

test.each([
  ['a phone', { e2eOnEmulator: false }],
  ['a build that does not say', {}],
  ['a build without OpaxVoice', null],
])('on %s the e2e build refuses 10.0.2.2', (_name, voice) => {
  expect(load({ os: 'android', origin: fixture, voice })).toEqual(
    new Error('The e2e build runs on the Android emulator only'),
  );
});

test('iOS keeps its simulator loopback', () => {
  expect(
    load({ os: 'ios', origin: 'http://127.0.0.1:8961', voice: null }),
  ).toBeNull();
});
