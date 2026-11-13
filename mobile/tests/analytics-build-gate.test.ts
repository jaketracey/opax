import Constants from 'expo-constants';

const mockCapture = jest.fn();
const mockCaptureException = jest.fn();
const mockScreen = jest.fn();
const mockClient = jest.fn(() => ({
  capture: mockCapture,
  captureException: mockCaptureException,
  screen: mockScreen,
}));
jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: function () {
    return mockClient();
  },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    debugMode: false,
    platform: { ios: { buildNumber: '43' } },
    executionEnvironment: 'standalone',
    expoConfig: {
      version: '1.1.4',
      ios: { buildNumber: '43' },
      android: { versionCode: 43 },
      extra: {
        variant: 'production',
        appBuild: '43',
        analytics: {
          host: 'https://opax.com.au/ingest',
          projectToken: 'phc_fixture000000000000000000000000',
          environment: 'production',
        },
      },
    },
  },
}));

const originalDev = __DEV__;
const original = JSON.stringify(Constants.expoConfig);
beforeEach(() => {
  Reflect.set(globalThis, '__DEV__', false);
  Constants.expoConfig = JSON.parse(original);
  Constants.debugMode = false;
  Constants.platform = {
    ios: { buildNumber: '43' },
  } as typeof Constants.platform;
  Constants.executionEnvironment =
    'standalone' as typeof Constants.executionEnvironment;
  mockClient.mockClear();
  mockCapture.mockClear();
  mockCaptureException.mockClear();
});
afterAll(() => {
  Reflect.set(globalThis, '__DEV__', originalDev);
});

function exercise(platform: 'ios' | 'android' = 'ios') {
  let enabled = false;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native');
    const os = jest.replaceProperty(Platform, 'OS', platform);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const analytics = require('../src/analytics');
    enabled = analytics.analyticsEnabled();
    analytics.startAnalytics();
    analytics.track('opax_app_start', { duration_ms: 123 });
    analytics.reportRouteError(new Error('Network request failed'), [
      'person',
      '[slug]',
    ]);
    os.restore();
  });
  return enabled;
}

test.each(['ios', 'android'] as const)(
  '%s release can send with explicit valid config',
  (platform) => {
    expect(exercise(platform)).toBe(true);
    expect(mockClient).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledTimes(2);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  },
);

test.each([
  [
    'debug JS',
    () => {
      Reflect.set(globalThis, '__DEV__', true);
    },
  ],
  [
    'debug runtime',
    () => {
      Constants.debugMode = true;
    },
  ],
  [
    'dev client',
    () => {
      Constants.executionEnvironment =
        'storeClient' as typeof Constants.executionEnvironment;
    },
  ],
  [
    'development variant',
    () => {
      Constants.expoConfig!.extra!.variant = 'development';
    },
  ],
  [
    'e2e variant',
    () => {
      Constants.expoConfig!.extra!.variant = 'e2e';
    },
  ],
  [
    'missing variant',
    () => {
      delete Constants.expoConfig!.extra!.variant;
    },
  ],
  [
    'build zero',
    () => {
      Constants.expoConfig!.extra!.appBuild = '0';
    },
  ],
  [
    'missing build',
    () => {
      delete Constants.expoConfig!.extra!.appBuild;
    },
  ],
  [
    'native build zero',
    () => {
      Constants.expoConfig!.ios!.buildNumber = '0';
    },
  ],
  [
    'missing native build',
    () => {
      delete Constants.expoConfig!.ios!.buildNumber;
    },
  ],
  [
    'binary build zero',
    () => {
      Constants.platform!.ios!.buildNumber = '0';
    },
  ],
  [
    'missing binary build',
    () => {
      Constants.platform!.ios!.buildNumber = null;
    },
  ],
  [
    'mismatched binary build',
    () => {
      Constants.platform!.ios!.buildNumber = '44';
    },
  ],
  [
    'mismatched build',
    () => {
      Constants.expoConfig!.extra!.appBuild = '44';
    },
  ],
  [
    'development analytics config',
    () => {
      Constants.expoConfig!.extra!.analytics.environment = 'development';
    },
  ],
  [
    'missing analytics config',
    () => {
      delete Constants.expoConfig!.extra!.analytics;
    },
  ],
] as const)(
  '%s never constructs a client or sends any event',
  (_name, change) => {
    change();
    expect(exercise()).toBe(false);
    expect(mockClient).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  },
);

test('Android missing or zero version code also fails closed', () => {
  for (const versionCode of [undefined, 0]) {
    Constants.expoConfig!.android!.versionCode = versionCode;
    expect(exercise('android')).toBe(false);
  }
  expect(mockClient).not.toHaveBeenCalled();
});

test.each(['development', 'e2e'])(
  'Android %s variant never starts the SDK',
  (variant) => {
    Constants.expoConfig!.extra!.variant = variant;
    expect(exercise('android')).toBe(false);
    expect(mockClient).not.toHaveBeenCalled();
  },
);
