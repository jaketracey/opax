import type { ExpoConfig } from 'expo/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  policy,
  productionVoiceEnabled,
  voicePrivacyManifest,
} from './plugins/voiceProduction';

type Variant = 'development' | 'e2e' | 'production';
const variant = (process.env.OPAX_VARIANT ?? 'development') as Variant;
// Explicit for native Android builds; the iOS invocation keeps its config.
const androidBuild = process.env.OPAX_TARGET_PLATFORM === 'android';
const productionVoice = !androidBuild && productionVoiceEnabled(variant);
const buildNumber = process.env.OPAX_BUILD_NUMBER ?? '1';
if (!/^[1-9][0-9]*$/.test(buildNumber)) {
  throw new Error('OPAX_BUILD_NUMBER must be a positive integer');
}
if (!['development', 'e2e', 'production'].includes(variant)) {
  throw new Error('OPAX_VARIANT must be development, e2e or production');
}
const port = Number(process.env.OPAX_FIXTURE_PORT ?? 8910);
if (!Number.isInteger(port) || port < 8900 || port > 8999) {
  throw new Error('OPAX_FIXTURE_PORT must be 8900–8999');
}
// These branches run at build time. Never put origin fallbacks in app JS.
const origin =
  variant === 'e2e'
    ? `http://${androidBuild ? '10.0.2.2' : '127.0.0.1'}:${port}`
    : variant === 'development'
      ? (process.env.OPAX_DEV_ORIGIN ?? 'https://opax.com.au')
      : 'https://opax.com.au';
const originURL = new URL(origin);
const localDevelopment =
  variant === 'development' &&
  originURL.protocol === 'http:' &&
  ['localhost', '127.0.0.1'].includes(originURL.hostname);
if (
  variant === 'development' &&
  originURL.protocol !== 'https:' &&
  !localDevelopment
)
  throw new Error('Development origin must use HTTPS or loopback HTTP');
if (
  originURL.username ||
  originURL.password ||
  originURL.pathname !== '/' ||
  originURL.search ||
  originURL.hash
)
  throw new Error('Invalid API origin');
// E2E canonical links are shown locally and never opened or shared.
const webOrigin = variant === 'e2e' ? 'https://opax.invalid' : origin;
const config: ExpoConfig = {
  name: 'OPAX',
  slug: 'opax',
  version: '1.0.0',
  scheme: 'opax',
  platforms: ['ios', 'android'],
  userInterfaceStyle: 'light',
  orientation: 'default',
  android: {
    package: 'au.com.opax.app',
    versionCode: Number(buildNumber),
    icon: './assets/icon/icon.png',
    adaptiveIcon: {
      foregroundImage: './assets/icon/android-foreground.png',
      backgroundImage: './assets/icon/android-background.png',
      backgroundColor: '#142A43',
      monochromeImage: './assets/icon/android-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
  ios: {
    bundleIdentifier: 'au.com.opax.app',
    icon: {
      light: './assets/icon/icon.png',
      dark: './assets/icon/icon-dark.png',
      tinted: './assets/icon/icon-tinted.png',
    },
    buildNumber,
    deploymentTarget: '18.4',
    // iPad (TestFlight builds from ios/app; the App Store 1.0 build on
    // ios/release-1.0 stays iPhone-only). With requireFullScreen false, Expo
    // writes all four UISupportedInterfaceOrientations~ipad, so Split View,
    // Slide Over and Stage Manager windows are allowed. The iPhone keeps its
    // own orientation list (`orientation: 'default'`) unchanged.
    supportsTablet: true,
    requireFullScreen: false,
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyCollectedDataTypes: [],
      // Local cache metadata, animation timers, storage-aware cache writes and
      // app-only preferences. No signal or derived value is sent off device.
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType:
            'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        'OPAX uses your location once, on your iPhone, to suggest your electorate. It is not sent anywhere.',
      ...(variant === 'e2e' ? { OPAXVoiceFixturePort: port } : {}),
      ...(variant === 'e2e' || localDevelopment
        ? {
            NSAppTransportSecurity: {
              NSAllowsArbitraryLoads: false,
              NSAllowsLocalNetworking: true,
              NSExceptionDomains: {
                [originURL.hostname]: {
                  NSExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: false,
                },
              },
            },
          }
        : {}),
    },
  },
  plugins: [
    './plugins/withAndroidPolicy.js',
    '@react-native-community/datetimepicker',
    ['expo-router', { sitemap: variant !== 'production' }],
    './plugins/withSceneLifecycle.js',
    './plugins/withPrivacyPatches.js',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'OPAX uses your location once, on your iPhone, to suggest your electorate. It is not sent anywhere.',
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        locationAlwaysAndWhenInUsePermission: false,
      },
    ],
    ['./plugins/withSearchGeometryProbe.js', { variant }],
    './plugins/withNetworkPolicy.js',
    './plugins/withGLCompilerCleanup.js',
    [
      'expo-splash-screen',
      {
        // The star mark and the "OPAX" wordmark, centred on paper, with no
        // other text. Rendered from assets/splash/*.svg by
        // scripts/render-splash.swift. The lockup is 200pt wide;
        // src/launch/LaunchHandoff.tsx draws the same image.
        //
        // No `dark` block: the app is light-only (UIUserInterfaceStyle Light)
        // and iOS draws the launch screen in the app's style, so a dark splash
        // could never show. The plugin would also switch the whole app to
        // Automatic to make it show. The navy artwork (splash-dark) is
        // rendered and ready for when a dark palette is approved.
        backgroundColor: '#FAF9F6',
        image: './assets/splash/splash@3x.png',
        imageWidth: 200,
        resizeMode: 'contain',
      },
    ],
    [
      './plugins/withVoiceAutolinking.js',
      { variant, ...(productionVoice ? { productionVoice: true } : {}) },
    ],
  ],
  extra: {
    ...(androidBuild && variant === 'e2e'
      ? {
          androidShareQaUrl:
            'https://opax.com.au/subject/person/anthony-albanese',
        }
      : {}),
    variant,
    supportPageAvailable: true,
    ...(productionVoice
      ? { productionVoiceEnabled: true, voiceConsentDefault: false }
      : {}),
    apiOrigin: origin,
    webOrigin,
    appVersion: '1.0.0',
    appBuild: buildNumber,
    fontAcknowledgements: ['Merriweather', 'PublicSans'].map((name) => ({
      name,
      notice: readFileSync(
        resolve(__dirname, `assets/fonts/OFL-${name}.txt`),
        'utf8',
      ),
    })),
  },
  updates: { enabled: false },
};
// Merge after the base config so independent on-device location declarations
// and existing required-reason entries survive their lane's integration.
if (productionVoice && config.ios) {
  config.ios.privacyManifests = voicePrivacyManifest(
    config.ios.privacyManifests,
  );
  Object.assign((config.ios.infoPlist ??= {}), {
    NSMicrophoneUsageDescription: policy.microphonePurpose,
    OPAXProductionVoiceEnabled: true,
    OPAXVoiceConsentDefault: policy.consentDefault,
    OPAXVoiceAllowedRoutes: policy.routes,
  });
}
export default config;
