import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import path from 'node:path';
import ProductionTalk from '../src/features/talk/entry.production';
import RealTalk from '../src/features/talk/entry';
import TalkScreen from '../src/features/talk/TalkScreen';
import { ContentUnavailable } from '../src/design/primitives';
import * as voice from '../src/voice';
import * as uiBridge from '../src/features/talk/bridge';

jest.mock('../modules/opax-voice', () => ({ __esModule: true, default: null }));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        variant: 'production',
        apiOrigin: 'https://opax.com.au',
        webOrigin: 'https://opax.com.au',
        appVersion: '1.0.0',
        appBuild: '5',
      },
    },
  },
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false, router: { push: jest.fn() } }));
jest.mock('expo/metro-config', () => ({
  getDefaultConfig: () => ({ resolver: {} }),
}));
test.each(['0', '1'])(
  'production voice mode %s selects the matching Talk entry',
  (mode) => {
    const prior = { ...process.env };
    process.env.OPAX_VARIANT = 'production';
    process.env.OPAX_PRODUCTION_VOICE = mode;
    jest.isolateModules(() => {
      const config = jest.requireActual('../metro.config');
      const result = config.resolver.resolveRequest(
        {
          originModulePath: path.join(__dirname, '../src/app/talk/index.tsx'),
          resolveRequest: () => ({
            type: 'sourceFile',
            filePath: path.join(__dirname, '../src/features/talk/entry.tsx'),
          }),
        },
        '../../features/talk/entry',
        'ios',
      );
      expect(result.filePath).toBe(
        path.join(
          __dirname,
          `../src/features/talk/entry.${mode === '0' ? 'production.ts' : 'tsx'}`,
        ),
      );
    });
    process.env = prior;
    expect(RealTalk).toBe(TalkScreen);
  },
);

test('switch-off Talk says it is not in this version, with no action (9)', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ProductionTalk />);
  });
  const unavailable = renderer.root.findByType(ContentUnavailable);
  expect(unavailable.props).toMatchObject({
    symbol: 'waveform',
    title: 'Talk isn’t available in this version',
  });
  expect(unavailable.props.action).toBeUndefined();
  act(() => renderer.unmount());
});

test('production without voice pods refuses calls and never enables consent', async () => {
  for (const command of [
    voice.snapshot,
    voice.status,
    voice.start,
    voice.mute,
    voice.end,
  ])
    expect(await command()).toEqual({ ok: false, error: 'unavailable' });
  expect(await uiBridge.readConsent()).toBe(false);
  expect(await uiBridge.setConsent(true)).toBe(false);
  expect(await uiBridge.sendText('Synthetic test')).toEqual({
    ok: false,
    error: 'unavailable',
  });
  const listener = jest.fn();
  voice.subscribe(listener)();
  expect(listener).not.toHaveBeenCalled();
});
