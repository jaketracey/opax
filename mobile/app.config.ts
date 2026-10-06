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
const productionVoice = productionVoiceEnabled(variant);
const motionPurpose =
  'OPAX doesn\'t use motion or fitness data. iOS requires this note because the location library behind "Use my location" includes motion features that OPAX never turns on.';
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
    ? `http://127.0.0.1:${port}`
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
  version: '0.1.0',
  scheme: 'opax',
  platforms: ['ios'],
  userInterfaceStyle: 'light',
  orientation: 'default',
  ios: {
    bundleIdentifier: 'au.com.opax.app',
    icon: {
      light: './assets/icon/icon.png',
      dark: './assets/icon/icon-dark.png',
      tinted: './assets/icon/icon-tinted.png',
    },
    buildNumber,
    deploymentTarget: '18.4',
    supportsTablet: false,
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyCollectedDataTypes: [],
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        'OPAX uses your location once, on your iPhone, to suggest your electorate. It is not sent anywhere.',
      NSMotionUsageDescription: motionPurpose,
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
    ['expo-router', { sitemap: variant !== 'production' }],
    './plugins/withSceneLifecycle.js',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'OPAX uses your location once, on your iPhone, to suggest your electorate. It is not sent anywhere.',
        locationAlwaysPermission: false,
        motionUsagePermission: motionPurpose,
        locationAlwaysAndWhenInUsePermission: false,
      },
    ],
    ['./plugins/withSearchGeometryProbe.js', { variant }],
    './plugins/withNetworkPolicy.js',
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
    variant,
    supportPageAvailable: true,
    ...(productionVoice
      ? { productionVoiceEnabled: true, voiceConsentDefault: false }
      : {}),
    apiOrigin: origin,
    webOrigin,
    appVersion: '0.1.0',
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
