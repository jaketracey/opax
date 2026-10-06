import { portraitDirectory } from '../src/api/portrait-disk-store';

import { unacceptedAdvisories } from '../scripts/advisory-policy';
import { scanSource, secretPattern } from '../scripts/source-boundary';
import { localImageURI } from '../src/api/image-policy';
import { Linter, type Rule } from 'eslint';
import * as parser from '@typescript-eslint/parser';
import transportRule from '../scripts/transport-rule';

jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  Directory: class {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((p) => (typeof p === 'string' ? p : p.uri))
        .join('/')
        .replace(/(?<!:)\/{2,}/g, '/')
        .replace('file:/', 'file:///');
    }
  },
}));

function lintBoundary(path: string, content: string) {
  const messages = new Linter().verify(
    content,
    {
      files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
      languageOptions: {
        parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: {
        opax: { rules: { transport: transportRule as Rule.RuleModule } },
      },
      rules: { 'opax/transport': 'error' },
    },
    { filename: path },
  );
  // A parse error is not proof that the transport rule detected the leak.
  expect(messages.filter((message) => message.fatal)).toEqual([]);
  return messages.filter((message) => message.ruleId === 'opax/transport');
}

test('both gates allow only the reviewed WebP renderer with the local URI guard', () => {
  const content = `import { Image as Photo } from 'expo-image';
    import { localImageURI } from '../api/image-policy';
    <Photo source={{ uri: localImageURI(file) }} contentFit="contain" cachePolicy="none" />`;
  expect(scanSource('src/design/people.tsx', content)).toEqual([]);
  expect(lintBoundary('src/design/people.tsx', content)).toEqual([]);
  expect(scanSource('src/design/other.tsx', content)).not.toEqual([]);
  expect(lintBoundary('src/design/other.tsx', content).length).toBeGreaterThan(
    0,
  );
});

test.each([
  `import * as SDK from 'expo-image';`,
  `import Image from 'expo-image';`,
  `import { Image, ImageRef } from 'expo-image';`,
  `import { useImage } from 'expo-image';`,
  `export { Image } from 'expo-image';`,
  `const SDK = require('expo-image');`,
  `import('expo-image');`,
  `import { Image } from 'expo-image'; Image.prefetch(url);`,
  `import { Image } from 'expo-image'; Image.loadAsync(url);`,
  `import { Image } from 'expo-image'; const escaped = Image;`,
  `import { Image } from 'expo-image'; <Image source={{ uri: url }} />;`,
  `import { Image } from 'expo-image'; <Image source={{ uri: localImageURI(file) }} placeholder={url} />;`,
  `import { Image } from 'expo-image'; <Image source={{ uri: localImageURI(file) }} {...props} />;`,
  `import { Image } from 'expo-image'; <Image />;`,
])(
  'both gates refuse WebP SDK transport escapes even in the renderer: %s',
  (snippet) => {
    const content = `import { localImageURI } from '../api/image-policy'; ${snippet}`;
    expect(scanSource('src/design/people.tsx', content)).not.toEqual([]);
    expect(
      lintBoundary('src/design/people.tsx', content).length,
    ).toBeGreaterThan(0);
  },
);

const reviewerLeaks = [
  [
    '01 cast global fetch',
    `(globalThis as any)['fet' + 'ch']('/api/search?q=x')`,
  ],
  ['02 window fetch', `(window as any)['fe' + 'tch']('/api/ask')`],
  ['03 reflective fetch', `Reflect.get(globalThis, 'fe' + 'tch')('/api/ask')`],
  [
    '04 computed require',
    `require('expo/fe' + 'tch')['fe' + 'tch']('/api/ask')`,
  ],
  [
    '05 image prefetch',
    `import { Image } from 'react-native'; Image.prefetch(o + '/og/x.png')`,
  ],
  [
    '06 legacy download',
    `import { downloadAsync } from 'expo-file-system/legacy'; downloadAsync(o + '/api/ask', 'file:///tmp/leak')`,
  ],
  [
    '07 remote asset',
    `import { Asset } from 'expo-asset'; Asset.fromURI(o + '/og/x.png').downloadAsync()`,
  ],
  [
    '08 background computed URI',
    `import { ImageBackground } from 'react-native'; const key = 'u' + 'ri'; const src = { [key]: url }; <ImageBackground source={src} />`,
  ],
  [
    '09 remote font',
    `import * as Font from 'expo-font'; Font.loadAsync({ Leak: o + '/og/font.ttf' })`,
  ],
  [
    '10 native networking',
    `import { NativeModules } from 'react-native'; NativeModules.Networking.sendRequest('GET', 1, '', '/api/ask', [], '', 'text', false, 0, false)`,
  ],
];
test.each(reviewerLeaks)(
  'both gates reject reviewer leak %s',
  (_name, snippet) => {
    const content = `declare const o: string; declare const url: string; ${snippet}`;
    expect(scanSource('src/leak.tsx', content)).not.toEqual([]);
    expect(lintBoundary('src/leak.tsx', content).length).toBeGreaterThan(0);
  },
);

test.each([
  `(globalThis!)['fet' + 'ch']('/api/ask')`,
  `(global satisfies unknown)['fe' + 'tch']('/api/ask')`,
  `((self as any)!)['fe' + 'tch']('/api/ask')`,
  `Reflect.apply(Reflect.get(window, 'fe' + 'tch'), window, ['/api/ask'])`,
  `import('expo/fe' + 'tch')`,
  `require(moduleName)`,
  `import { Image as Portrait } from 'react-native'; (Portrait as any).getSize(url)`,
  `import * as RN from 'react-native'; RN.Image.getSizeWithHeaders(url, {})`,
  `import { uploadAsync as upload } from 'expo-file-system/legacy'; upload(url, file)`,
  `import { Asset as Portrait } from 'expo-asset'; Portrait.fromURI(url)`,
  `import * as Assets from 'expo-asset'; Assets.Asset.fromURI(url)`,
  `import * as Font from 'expo-font'; Font.loadAsync('Leak', url)`,
  `import { loadAsync as load } from 'expo-font'; load({ Leak: url })`,
  `import { useFonts } from 'expo-font'; useFonts({ Leak: url })`,
  `import * as Font from 'expo-font'; Font.loadAsync({ ...fonts })`,
  `import * as Font from 'expo-font'; const load = Font.loadAsync; load({ Leak: url })`,
  `import * as Font from 'expo-font'; Font[method]({ Leak: url })`,
  `import { TurboModuleRegistry as Registry } from 'react-native'; Registry.getEnforcing('Networking')`,
  `<Photo source={{ ['u' + 'ri']: localImageURI('/photos/10007.webp') }} />`,
  `<Photo source={{ [key]: url }} />`,
  `<Photo source={{ ...source }} />`,
  `<Photo source={source} />`,
  `<Photo source={require(moduleName)} />`,
])(
  'both gates reject wrapped, aliased or alternate transport: %s',
  (content) => {
    expect(scanSource('src/leak.tsx', content)).not.toEqual([]);
    expect(lintBoundary('src/leak.tsx', content).length).toBeGreaterThan(0);
  },
);

test.each([
  `import { localImageURI as portrait } from './api/image-policy'; <Photo source={{ uri: portrait('/photos/10007.webp') }} />`,
  `import { localImageURI } from './api/image-policy'; <ImageBackground source={({ uri: (localImageURI('/photos/10007.webp') as string) })!} />`,
  `<Photo source={require('./assets/portrait.webp')} />`,
  `import * as Font from 'expo-font'; Font.loadAsync({ Bundled: require('./assets/font.ttf') })`,
  `import { loadAsync as load } from 'expo-font'; load('Bundled', (require('./assets/font.ttf') as number)!)`,
  `import { useFonts } from 'expo-font'; useFonts({ Bundled: require('./assets/font.ttf') })`,
])('both gates allow reviewed portraits and bundled assets: %s', (content) => {
  expect(scanSource('src/photo.tsx', content)).toEqual([]);
  expect(lintBoundary('src/photo.tsx', content)).toEqual([]);
});

test('native access has no implicit voice or nested-client exemption', () => {
  for (const path of ['src/api/voice.ts', 'src/features/api/client.ts']) {
    const content = `import { NativeModules } from 'react-native'; NativeModules.Networking.sendRequest()`;
    expect(scanSource(path, content)).not.toEqual([]);
    expect(lintBoundary(path, content).length).toBeGreaterThan(0);
  }
});

test.each([
  `<Image src={url} />`,
  `<Image srcSet={url} />`,
  `<ImageBackground defaultSource={{ uri: url }} />`,
  `<RemoteImageView loadingIndicatorSource={url} />`,
  `import { ImageBackground as Backdrop } from 'react-native'; <Backdrop srcSet={url} />`,
  `import { Image as Portrait } from 'react-native'; <Portrait src={url} />`,
  `import * as RN from 'react-native'; <RN.Image defaultSource={url} />`,
  `import { Image } from 'react-native'; Image.prefetchWithMetadata(url, 'query')`,
  `import { Asset } from 'expo-asset'; Asset.loadAsync(url)`,
  `import { Asset as Assets } from 'expo-asset'; Assets.loadAsync([url])`,
  `import { useAssets } from 'expo-asset'; useAssets([url])`,
  `import { useAssets as assets } from 'expo-asset'; assets([require('./local.png'), url])`,
  `import * as Assets from 'expo-asset'; Assets.Asset.loadAsync(url)`,
  `import * as Assets from 'expo-asset'; Assets.useAssets([url])`,
])('both gates reject ordinary image/asset transport: %s', (content) => {
  expect(scanSource('src/portrait.tsx', content)).not.toEqual([]);
  expect(lintBoundary('src/portrait.tsx', content).length).toBeGreaterThan(0);
});

test.each([
  `<Image src={portrait('/photos/10007.webp')} />`,
  `<Image srcSet={portrait('/photos/10007.webp')} />`,
  `<ImageBackground defaultSource={{ uri: portrait('/photos/10007.webp') }} />`,
  `<RemoteImageView loadingIndicatorSource={require('./portrait.webp')} />`,
  `import { ImageBackground as Backdrop } from 'react-native'; <Backdrop srcSet={portrait('/photos/10007.webp')} />`,
  `import { Asset } from 'expo-asset'; Asset.loadAsync(require('./local.png'))`,
  `import { Asset } from 'expo-asset'; Asset.loadAsync([require('./local.png'), require('./other.png')])`,
  `import { useAssets } from 'expo-asset'; useAssets([require('./local.png')])`,
  `import * as Assets from 'expo-asset'; Assets.useAssets(require('./local.png'))`,
])('both gates allow ordinary image/asset policy forms: %s', (snippet) => {
  const content = `import { localImageURI as portrait } from './api/image-policy'; ${snippet}`;
  expect(scanSource('src/portrait.tsx', content)).toEqual([]);
  expect(lintBoundary('src/portrait.tsx', content)).toEqual([]);
});
const shareModule = 'modules/opax-share/index.ts';
test.each(['src', 'srcSet', 'defaultSource', 'loadingIndicatorSource'])(
  'both gates reject an Avatar wrapper forwarding %s',
  (prop) => {
    const content = `import { Image, type ImageProps } from 'react-native';
      function Avatar(props: ImageProps) { return <Image {...props} />; }
      const url = origin + '/og/portrait.png';
      <Avatar ${prop}={url} />;`;
    expect(scanSource('src/avatar.tsx', content)).not.toEqual([]);
    expect(lintBoundary('src/avatar.tsx', content).length).toBeGreaterThan(0);
  },
);
test.each([
  `src={portrait('/photos/10007.webp')}`,
  `srcSet={portrait('/photos/10007.webp')}`,
  `defaultSource={{ uri: portrait('/photos/10007.webp') }}`,
  `loadingIndicatorSource={require('./local.webp')}`,
])('both gates allow an Avatar wrapper using the policy: %s', (prop) => {
  const content = `import { Image, type ImageProps } from 'react-native';
    import { localImageURI as portrait } from './api/image-policy';
    function Avatar(props: ImageProps) { return <Image {...props} />; }
    <Avatar ${prop} />;`;
  expect(scanSource('src/avatar.tsx', content)).toEqual([]);
  expect(lintBoundary('src/avatar.tsx', content)).toEqual([]);
});
test.each([
  `import { requireNativeModule } from 'expo'; requireNativeModule('ExpoFetchModule')`,
  `import { requireOptionalNativeModule } from 'expo'; requireOptionalNativeModule('Networking')`,
  `import { requireNativeView } from 'expo'; requireNativeView('ExpoWebView')`,
  `import { requireNativeViewManager } from 'expo-modules-core'; requireNativeViewManager('ExpoWebView')`,
  `import { requireOptionalNativeModule as load } from 'expo'; load(moduleName)`,
  `import * as Expo from 'expo'; Expo.requireNativeModule('Networking')`,
  `globalThis.nativeModuleProxy.Networking`,
  `global.__turboModuleProxy('Networking')`,
  `globalThis.expo.modules.ExpoFetchModule`,
  `self.expo.modules.Networking`,
  `import { NativeModulesProxy } from 'expo-modules-core'; NativeModulesProxy.Networking`,
  `import Transport from 'react-native/Libraries/Network/RCTNetworking'`,
  `import Loader from 'react-native/Libraries/Image/NativeImageLoaderIOS'`,
  `import Request from 'react-native/Libraries/Network/XMLHttpRequest'`,
  `fetch('/api/ask')`,
])('both gates reject module-tree native/network leaks: %s', (content) => {
  expect(scanSource('modules/leak/index.ts', content)).not.toEqual([]);
  expect(lintBoundary('modules/leak/index.ts', content).length).toBeGreaterThan(
    0,
  );
});

test.each([
  `import { requireOptionalNativeModule } from 'expo'; requireOptionalNativeModule('OpaxShare')`,
  `import { requireNativeModule as load } from 'expo'; load('OpaxShare')`,
  `import { requireNativeView } from 'expo'; requireNativeView('OpaxShare')`,
  `import { NativeModules } from 'react-native'; NativeModules.OpaxShare`,
  `import { NativeModules as Native } from 'react-native'; Native['OpaxShare']`,
  `import { TurboModuleRegistry as Registry } from 'react-native'; Registry.getEnforcing('OpaxShare')`,
  `import * as RN from 'react-native'; RN.NativeModules.OpaxShare`,
  `import * as RN from 'react-native'; RN.TurboModuleRegistry.get('OpaxShare')`,
])(
  'native grants require the exact source and module-name pair: %s',
  (content) => {
    expect(scanSource(shareModule, content)).toEqual([]);
    expect(lintBoundary(shareModule, content)).toEqual([]);
    for (const path of [
      'src/share.ts',
      'modules/opax-share/src/index.ts',
      'modules/opax-share-copy/index.ts',
    ]) {
      expect(scanSource(path, content)).not.toEqual([]);
      expect(lintBoundary(path, content).length).toBeGreaterThan(0);
    }
    const wrongName = content.replaceAll('OpaxShare', 'Networking');
    expect(scanSource(shareModule, wrongName)).not.toEqual([]);
    expect(lintBoundary(shareModule, wrongName).length).toBeGreaterThan(0);
  },
);
test('reviewed bridges still reject dynamic names and proxy access', () => {
  for (const content of [
    `import { requireOptionalNativeModule } from 'expo'; requireOptionalNativeModule(name)`,
    `import { NativeModules } from 'react-native'; NativeModules[name]`,
    `import { TurboModuleRegistry } from 'react-native'; TurboModuleRegistry.get(name)`,
    `globalThis.expo.modules.OpaxShare`,
  ]) {
    expect(scanSource(shareModule, content)).not.toEqual([]);
    expect(lintBoundary(shareModule, content).length).toBeGreaterThan(0);
  }
});
test('registers only the shipped static voice loader', () => {
  const path = 'modules/opax-voice/index.ts';
  const content = `import { requireNativeModule } from 'expo'; requireNativeModule('OpaxVoice')`;
  expect(scanSource(path, content)).toEqual([]);
  expect(lintBoundary(path, content)).toEqual([]);
  expect(
    scanSource(path, content.replace('OpaxVoice', 'Networking')),
  ).not.toEqual([]);
});
test('the unused voice loader path grants no native access', () => {
  const path = 'modules/opax-voice/src/OpaxVoiceModule.ts';
  const content = `import { requireNativeModule } from 'expo'; requireNativeModule('OpaxVoice')`;
  expect(scanSource(path, content)).not.toEqual([]);
  expect(lintBoundary(path, content).length).toBeGreaterThan(0);
});
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { variant: 'production', apiOrigin: 'https://example.test' },
    },
  },
}));
test.each([
  `import transport from 'expo/build/winter/fetch/ExpoFetchModule'; transport(url)`,
  `import { requireNativeModule as load } from 'expo-modules-core/build/requireNativeModule'; load('OpaxShare')`,
  `require('expo-router/build/linking')`,
  `import('expo-asset/build/Asset')`,
  `import('expo/fetch/private')`,
  `import('expo-router/unstable-native-tabs/private')`,
  `import Icon from '@expo/vector-icons/build/vendor/Icon'`,
])('both gates reject unreviewed Expo subpaths: %s', (content) => {
  expect(scanSource(shareModule, content)).not.toEqual([]);
  expect(lintBoundary(shareModule, content).length).toBeGreaterThan(0);
});
test.each([
  ['src/api/client.ts', `import { fetch } from 'expo/fetch'`],
  [
    'src/tabs.tsx',
    `import { NativeTabs } from 'expo-router/unstable-native-tabs'`,
  ],
  ['src/tabs.tsx', `import { router } from 'expo-router'`],
  ['src/icon.tsx', `import Icons from '@expo/vector-icons'`],
  [
    shareModule,
    `import { requireOptionalNativeModule } from 'expo'; requireOptionalNativeModule('OpaxShare')`,
  ],
])(
  'both gates allow reviewed Expo subpaths and package roots in %s',
  (path, content) => {
    expect(scanSource(path!, content!)).toEqual([]);
    expect(lintBoundary(path!, content!)).toEqual([]);
  },
);
test('the Expo fetch subpath remains exclusive to the API client', () => {
  const content = `import { fetch } from 'expo/fetch'`;
  expect(scanSource('src/leak.ts', content)).not.toEqual([]);
  expect(lintBoundary('src/leak.ts', content).length).toBeGreaterThan(0);
});
test('intended React Native and Expo external link/share paths remain allowed', () => {
  const content = `import { Linking, Share } from 'react-native';
    import * as ExpoLinking from 'expo-linking';
    Linking.openURL(page); ExpoLinking.openURL(page); Share.share({ url: page });`;
  expect(scanSource('src/link.ts', content)).toEqual([]);
  expect(lintBoundary('src/link.ts', content)).toEqual([]);
});
test.each([
  `import { useFonts } from 'expo-font'; useFonts({ [fonts.serif]: require('./Merriweather.ttf'), [fonts.sans]: require('./PublicSans.ttf') })`,
  `import * as Font from 'expo-font'; Font.loadAsync({ [family]: require('./Local.ttf') })`,
  `import { useFonts } from 'expo-font'; useFonts({ ['uri']: require('./Local.ttf') })`,
])(
  'both gates allow computed font family keys with bundled values: %s',
  (content) => {
    expect(scanSource('src/fonts.ts', content)).toEqual([]);
    expect(lintBoundary('src/fonts.ts', content)).toEqual([]);
  },
);
test.each([
  `import { useFonts } from 'expo-font'; useFonts({ [fonts.serif]: url })`,
  `import { useFonts } from 'expo-font'; useFonts({ [fonts.serif]: require('./Local.ttf'), [fonts.sans]: url })`,
  `import * as Font from 'expo-font'; Font.loadAsync({ ...fonts })`,
])('both gates still reject unbundled computed font values: %s', (content) => {
  expect(scanSource('src/fonts.ts', content)).not.toEqual([]);
  expect(lintBoundary('src/fonts.ts', content).length).toBeGreaterThan(0);
});
test('citation labels get a specific source-prop diagnostic and a supported replacement', () => {
  const bad = `<SourceLink source="ParlInfo" url={page} />`;
  expect(scanSource('src/citation.tsx', bad)).toContain(
    '`source` is reserved for images; use `citation` for text labels. Image sources must use bundled require assets or the imported image policy helper',
  );
  expect(lintBoundary('src/citation.tsx', bad)[0]!.message).toContain(
    'use `citation` for text labels',
  );
  const good = bad.replace('source=', 'citation=');
  expect(scanSource('src/citation.tsx', good)).toEqual([]);
  expect(lintBoundary('src/citation.tsx', good)).toEqual([]);
});
test.each([
  `import Transport from 'react-native/src/private/specs_DEPRECATED/modules/NativeNetworkingIOS'`,
  `import Loader from 'react-native/src/private/specs_DEPRECATED/modules/NativeImageLoaderIOS'`,
  `require('react-native/src/private/specs_DEPRECATED/modules/NativeWebSocketModule')`,
])('both gates reject React Native subpaths: %s', (content) => {
  expect(scanSource('src/leak.ts', content)).not.toEqual([]);
  expect(lintBoundary('src/leak.ts', content).length).toBeGreaterThan(0);
});
test.each([
  'modules/opax-voice/scripts/generate-deletion-fixtures.mjs',
  'modules/opax-voice/scripts/nested/generator.ts',
])('both gates exempt module Node tooling at %s', (path) => {
  const content = `import { runInNewContext } from 'node:vm';
    const request = new Request('http://127.0.0.1:8953/api/delete');
    runInNewContext('fetch(request)', { request });`;
  expect(scanSource(path, content)).toEqual([]);
  expect(lintBoundary(path, content)).toEqual([]);
});
test.each([
  ['src/app.ts', `import '../modules/opax-voice/scripts/generate.mjs'`],
  ['modules/opax-voice/index.ts', `import './scripts/generate.mjs'`],
  ['modules/opax-voice/index.ts', `export * from './scripts/generate.mjs'`],
  [
    'modules/opax-voice/index.cts',
    `import tool = require('./scripts/generate.cjs')`,
  ],
  ['src/app.ts', `require('../modules/opax-voice/scripts/generate.mjs')`],
  ['src/app.ts', `import('../modules/opax-voice/' + 'scripts/generate.mjs')`],
  ['src/app.ts', `import '@/../modules/opax-voice/scripts/generate.mjs'`],
  ['src/app.ts', `import 'modules/opax-voice/scripts/generate.mjs'`],
  ['src/app.ts', `import 'opax-voice/scripts/generate.mjs'`],
  ['src/app.ts', `import '@opax/opax-voice/scripts/generate.mjs'`],
  [
    'modules/opax-share/index.ts',
    `import '../opax-voice/src/../scripts/generate.mjs'`,
  ],
])(
  'both gates forbid app/module imports into Node tooling: %s %s',
  (path, content) => {
    const reason =
      'Module Node tooling cannot be imported by app or module source';
    expect(scanSource(path, content)).toContain(reason);
    expect(
      lintBoundary(path, content).map((message) => message.message),
    ).toContain(reason);
  },
);
test.each([
  'modules/opax-voice/src/scripts/app.ts',
  'modules/opax-voice/script/app.ts',
  'src/scripts/app.ts',
])('Node tooling exemption does not cover app source at %s', (path) => {
  const content = `fetch('/api/ask')`;
  expect(scanSource(path, content)).not.toEqual([]);
  expect(lintBoundary(path, content).length).toBeGreaterThan(0);
});
test('module tooling imports stay allowed from tooling; plain script labels are not imports', () => {
  const tooling = `import './nested/generate.mjs'; require('../scripts/helper.cjs')`;
  expect(
    scanSource('modules/opax-voice/scripts/generate.mjs', tooling),
  ).toEqual([]);
  expect(
    lintBoundary('modules/opax-voice/scripts/generate.mjs', tooling),
  ).toEqual([]);
  const app = `import Voice from '../modules/opax-voice'; const label = 'modules/opax-voice/scripts/generate.mjs'`;
  expect(scanSource('src/app.ts', app)).toEqual([]);
  expect(lintBoundary('src/app.ts', app)).toEqual([]);
});
test.each([
  ['leak.js', `fetch('https://example.test/api/ask')`],
  ['leak.ts', `globalThis['fet' + 'ch']('x')`],
  ['leak.ts', `const Request = XMLHttpRequest; new Request()`],
  ['leak.ts', `new globalThis.WebSocket('x')`],
  ['leak.tsx', `<Image source={{uri: origin + '/og/a'}}/>`],
  ['leak.ts', `File.downloadFileAsync(origin + '/api/search-all?kind=all')`],
  ['leak.mjs', `const Source = EventSource`],
  ['leak.cts', `import View from 'react-native-webview'`],
])('rejects transport planted in %s', (path, content) =>
  expect(scanSource(path, content)).not.toEqual([]),
);
test('remote image expressions must call the imported policy helper', () => {
  expect(
    scanSource(
      'src/photo.tsx',
      `import { localImageURI as portrait } from './api/image-policy'; <Image source={{ uri: portrait('/photos/10007.webp') }} />`,
    ),
  ).toEqual([]);
  expect(
    scanSource(
      'src/photo.tsx',
      `const localImageURI = x => x; <Image source={{ uri: localImageURI('/og/x') }} />`,
    ),
  ).not.toEqual([]);
});
test('native images accept only local cache files from the configured origin', () => {
  const root =
    portraitDirectory('https://example.test').uri.replace(/\/$/, '') + '/';
  expect(localImageURI(root + '10007.webp')).toBe(root + '10007.webp');
  for (const value of [
    'https://example.test/photos/10007.webp',
    '/photos/10007.webp',
    root + '../10007.webp',
    root + '%31.webp',
    root + '10007.webp?x=1',
    root + 'people.json',
    'file:///other/10007.webp',
  ])
    expect(() => localImageURI(value)).toThrow();
});
test('secret signatures cover text files as well as source', () => {
  expect(secretPattern.test(`access_token="${'x'.repeat(32)}"`)).toBe(true);
  expect(secretPattern.test(`ghp_${'x'.repeat(36)}`)).toBe(true);
});

test('acceptance of one advisory cannot hide a new runtime advisory in the same package', () => {
  const accepted = [
    {
      package: 'decoder',
      advisory: 'GHSA-old',
      exposure: 'runtime',
      reason: 'Reviewed',
    },
  ];
  expect(
    unacceptedAdvisories(
      [
        { name: 'decoder', url: 'https://github.com/advisories/GHSA-old' },
        { name: 'decoder', url: 'https://github.com/advisories/GHSA-new' },
      ],
      accepted,
    ),
  ).toEqual([
    { name: 'decoder', url: 'https://github.com/advisories/GHSA-new' },
  ]);
});

test('transport exemptions apply only to the single actual API client', () => {
  expect(scanSource('src/features/api/client.ts', `fetch('x')`)).not.toEqual(
    [],
  );
  expect(
    scanSource(
      'src/photo.tsx',
      `import { Image as Portrait } from 'react-native'; <Portrait source={arbitrarySource} />`,
    ),
  ).not.toEqual([]);
});
