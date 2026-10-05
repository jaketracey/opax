import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import path from 'node:path';
import ProductionTalk from '../src/features/talk/TalkScreen.production';
import { TalkComingSoon } from '../src/features/ComingSoon';
import { Text } from '../src/design/primitives';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'production' } } },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo/metro-config', () => ({
  getDefaultConfig: () => ({ resolver: {} }),
}));
test('production variant selects the unchanged placeholder without loading the voice screen', () => {
  const prior = process.env.OPAX_VARIANT;
  process.env.OPAX_VARIANT = 'production';
  const config = jest.requireActual('../metro.config');
  const result = config.resolver.resolveRequest(
    { originModulePath: path.join(__dirname, '../src/app/talk.tsx') },
    '../features/talk/TalkScreen',
    'ios',
  );
  expect(result.filePath).toBe(
    path.join(__dirname, '../src/features/talk/TalkScreen.production.tsx'),
  );
  process.env.OPAX_VARIANT = prior;
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
