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
// One switch for both platforms: Android 1.0 ships Talk and accounts too.
const productionVoice = productionVoiceEnabled(variant);
// Android e2e only: OPAX_E2E_MICROPHONE=1 declares the microphone so Talk's
// permission prompt (rationale, system dialog, denial, "don't ask again") runs
// against the local fixture. Native input stays synthetic: no e2e build ever
// opens the microphone. Production decides with the voice switch alone.
const e2eMicrophone = process.env.OPAX_E2E_MICROPHONE ?? '0';
if (!['0', '1'].includes(e2eMicrophone))
  throw new Error('OPAX_E2E_MICROPHONE must be 0 or 1');
const microphonePrompt =
  androidBuild && variant === 'e2e' && e2eMicrophone === '1';
// Anonymous product analytics (docs/ANALYTICS.md): iOS production only.
// Development and e2e never carry analytics, even with OPAX_ANALYTICS=1. Android stays
// off until its Google Play Data safety answers include analytics (the code is
// shared; drop the androidBuild condition then). Events go through
// the opax.com.au Worker proxy to PostHog project 507367 (Opax). The token is
// the website's public, write-only ingestion token, not a personal API key.
const analyticsSwitch = process.env.OPAX_ANALYTICS ?? '0';
if (!['0', '1'].includes(analyticsSwitch))
  throw new Error('OPAX_ANALYTICS must be 0 or 1');
const analytics =
  !androidBuild &&
  variant === 'production'
    ? {
        host: 'https://opax.com.au/ingest',
        projectToken: 'phc_AsHnQM2UrGBubA5HU9sagkGbg8vqQLNXu3WjEhPRDejr',
        environment: variant,
      }
    : undefined;
// What analytics collects, as the privacy manifest declares it: how the app
// is used (screens, app opens, Ask and Search outcomes as counts) and the
// random install ID that groups those events. Neither is linked to an
// account or used for tracking. A voice build merges its own linked types.
const analyticsDataTypes = analytics
  ? ['ProductInteraction', 'DeviceID'].map((type) => ({
      NSPrivacyCollectedDataType: `NSPrivacyCollectedDataType${type}`,
      NSPrivacyCollectedDataTypeLinked: false,
      NSPrivacyCollectedDataTypeTracking: false,
      NSPrivacyCollectedDataTypePurposes: [
        'NSPrivacyCollectedDataTypePurposeAnalytics',
      ],
    }))
  : [];
const buildNumber = process.env.OPAX_BUILD_NUMBER ?? '1';
if (!/^[1-9][0-9]*$/.test(buildNumber)) {
  throw new Error('OPAX_BUILD_NUMBER must be a positive integer');
}
if (androidBuild && Number(buildNumber) > 2100000000) {
  throw new Error('Android versionCode must be at most 2100000000');
}
if (!['development', 'e2e', 'production'].includes(variant)) {
  throw new Error('OPAX_VARIANT must be development, e2e or production');
}
// Capture switches never alter a production build's defaults.
const headingFace = process.env.OPAX_HEADING_FACE ?? 'system';
if (!['system', 'serif'].includes(headingFace))
  throw new Error('OPAX_HEADING_FACE must be system or serif');
const appearance = process.env.OPAX_APPEARANCE ?? 'light';
if (!['light', 'automatic'].includes(appearance))
  throw new Error('OPAX_APPEARANCE must be light or automatic');
const defaultDesignFlags = {
  categorySymbols: true,
  searchTab: true,
  talkInAsk: true,
  groupedSurfaces: true,
};
// Optional JSON becomes extra.designFlags, allowing captures without edits.
const flagOverrides: unknown =
  variant !== 'production' && process.env.OPAX_DESIGN_FLAGS
    ? JSON.parse(process.env.OPAX_DESIGN_FLAGS)
    : {};
if (
  !flagOverrides ||
  typeof flagOverrides !== 'object' ||
  Array.isArray(flagOverrides) ||
  Object.entries(flagOverrides).some(
    ([name, value]) =>
      !(name in defaultDesignFlags) || typeof value !== 'boolean',
  )
)
  throw new Error(
    'OPAX_DESIGN_FLAGS must be a JSON object of known boolean flags',
  );
const designFlags = { ...defaultDesignFlags, ...flagOverrides };
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
// The one app version: the store version, the API User-Agent
// (extra.appVersion) and analytics' app_version all read it, so they cannot
// drift apart again (extra.appVersion was a stale '1.0.0' until 1.1.0).
const appVersion = '1.1.4';
const config: ExpoConfig = {
  name: 'OPAX',
  slug: 'opax',
  version: appVersion,
  scheme: 'opax',
  platforms: ['ios', 'android'],
  userInterfaceStyle:
    variant !== 'production' && appearance === 'automatic'
      ? 'automatic'
      : 'light',
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
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      ...(microphonePrompt ? ['RECORD_AUDIO'] : []),
    ],
    // The OpaxVoice module declares RECORD_AUDIO. As iOS embeds its purpose
    // string, only a production voice build keeps it: e2e uses the synthetic
    // input and development never opens the hardware microphone.
    blockedPermissions: [
      ...(productionVoice || microphonePrompt
        ? []
        : ['android.permission.RECORD_AUDIO']),
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
    // iPhone and iPad, in TestFlight and in the App Store 1.0 build. With
    // requireFullScreen false, Expo writes all four
    // UISupportedInterfaceOrientations~ipad, so Split View, Slide Over and
    // Stage Manager windows are allowed. The iPhone keeps its own
    // orientation list (`orientation: 'default'`) unchanged.
    supportsTablet: true,
    requireFullScreen: false,
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyCollectedDataTypes: analyticsDataTypes,
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
      // Light status bar text over the navy launch screen. React Native's
      // StatusBar takes over once the app draws (the root layout sets
      // `auto`; the launch cover keeps `light` while it is up).
      UIStatusBarStyle: 'UIStatusBarStyleLightContent',
      // The PostHog crash plugin hooks notification opens at launch, before
      // any JS runs; only this key skips it. The app sends no push events.
      'com.posthog.posthog.CAPTURE_PUSH_NOTIFICATION_OPENED': false,
      NSLocationWhenInUseUsageDescription:
        'OPAX uses your location once, on this iPhone, to find your electorate. It is not sent anywhere.',
      'NSLocationWhenInUseUsageDescription~ipad':
        'OPAX uses your location once, on this iPad, to find your electorate. It is not sent anywhere.',
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
    ...(androidBuild
      ? [
          ['./plugins/withAndroidRelease.js', { variant }] as [
            string,
            { variant: Variant },
          ],
        ]
      : []),
    './plugins/withAndroidPolicy.js',
    ...(androidBuild
      ? [
          './plugins/withAndroidUploadSigning.js',
          './plugins/withAndroidBack.js',
          './plugins/withAndroidTheme.js',
        ]
      : []),
    '@react-native-community/datetimepicker',
    ['expo-router', { sitemap: variant !== 'production' }],
    './plugins/withSceneLifecycle.js',
    './plugins/withPrivacyPatches.js',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'OPAX uses your location once, on this iPhone, to find your electorate. It is not sent anywhere.',
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
        // The gold star and the paper "OPAX" wordmark, centred on the brand
        // navy, with no other text. Rendered from assets/splash/*.svg by
        // scripts/render-splash.swift. The lockup is 200pt wide;
        // src/launch/LaunchHandoff.tsx draws the same layers in the same
        // place and then unfolds the name from them.
        //
        // The field is navy in both appearances, so one colour serves both.
        // Setting a `dark` block makes the plugin switch iOS to Automatic,
        // so release and light-only builds leave it unset; only
        // automatic-appearance captures carry it, with the same navy.
        backgroundColor: '#142A43',
        dark:
          variant !== 'production' && appearance === 'automatic'
            ? { backgroundColor: '#142A43' }
            : undefined,
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
    headingFace: variant === 'production' ? 'system' : headingFace,
    designFlags,
    supportPageAvailable: true,
    ...(productionVoice
      ? { productionVoiceEnabled: true, voiceConsentDefault: false }
      : {}),
    ...(microphonePrompt ? { e2eMicrophonePrompt: true } : {}),
    apiOrigin: origin,
    webOrigin,
    ...(analytics ? { analytics } : {}),
    appVersion,
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
