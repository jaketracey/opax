import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import path from 'node:path';
import ProductionTalk from '../src/features/talk/entry.production';
import RealTalk from '../src/features/talk/entry';
import TalkScreen from '../src/features/talk/TalkScreen';
import { TalkComingSoon } from '../src/features/ComingSoon';
import { Text } from '../src/design/primitives';
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
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
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
          originModulePath: path.join(__dirname, '../src/app/talk.tsx'),
          resolveRequest: () => ({
            type: 'sourceFile',
            filePath: path.join(__dirname, '../src/features/talk/entry.tsx'),
          }),
        },
        '../features/talk/entry',
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

test('switch-off Talk keeps the placeholder copy', () => {
  expect(ProductionTalk).toBe(TalkComingSoon);
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ProductionTalk />);
  });
  const copy = renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children);
  expect(copy).toEqual([
    'Talk to OPAX is not in this version of the app yet.',
    'It will let you ask about Australian politics, spending and the public record by voice, with links to the records behind each answer. Talking will need a free OPAX account. Everything else in the app works without one.',
  ]);
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
