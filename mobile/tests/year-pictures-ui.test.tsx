import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Image } from 'react-native';
import { Button, Disclosure } from '../src/design/primitives';
import { YearPictures } from '../src/features/explore/YearPictures';
import { apiClient, yearPictures } from '../src/api/runtime';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const manifest = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../portal/public/years/pictures.json'),
    'utf8',
  ),
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn(), getForAction: jest.fn() },
  yearPictures: { get: jest.fn() },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => {
    if (!uri.startsWith('file:///cache/')) throw new Error('not local');
    return uri;
  },
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: () => true,
  useAccessibilitySize: () => false,
}));
test('photo reads wait for explicit disclosure open, preserve frame during decode, use only local images and no paid read', async () => {
  jest
    .mocked(apiClient.get)
    .mockResolvedValue({
      data: manifest,
      stale: false,
      asOf: null,
      savedAt: 1000,
    });
  jest
    .mocked(yearPictures.get)
    .mockImplementation(async (key) => `file:///cache/${key}.webp`);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <Disclosure label="Photographs" testID="photos">
        {() => <YearPictures year={2025} />}
      </Disclosure>,
    );
  });
  expect(apiClient.get).not.toHaveBeenCalled();
  expect(yearPictures.get).not.toHaveBeenCalled();
  await act(async () => {
    renderer.root
      .findAllByProps({ testID: 'photos' })
      .find((n) => n.props.onPress)!
      .props.onPress();
  });
  expect(apiClient.get).toHaveBeenCalledWith(
    '/years/pictures.json',
    expect.any(Function),
  );
  expect(yearPictures.get).toHaveBeenCalledTimes(6);
  const image = renderer.root.findAllByType(Image)[0]!;
  expect(image.props.source.uri).toBe(
    'file:///cache/2025-cooper-polling-place.webp',
  );
  const frame = renderer.root.findAllByProps({
    testID: 'tm-photo-2025-cooper-polling-place-placeholder',
  })[0]!.props.style;
  act(() => image.props.onLoad());
  expect(
    renderer.root.findAllByProps({
      testID: 'tm-photo-2025-cooper-polling-place-loaded',
    })[0]!.props.style,
  ).toEqual(frame);
  expect(frame).toMatchObject({
    width: '100%',
    aspectRatio: manifest['2025'][0].width / manifest['2025'][0].height,
  });
  expect(apiClient.getForAction).not.toHaveBeenCalled();
  const obsoleteError = image.props.onError;
  act(() => obsoleteError());
  expect(yearPictures.get).toHaveBeenCalledTimes(6);
  await act(async () => renderer.root.findAllByType(Button).find(n => n.props.label === 'Try again')!.props.onPress());
  expect(yearPictures.get).toHaveBeenLastCalledWith('2025-cooper-polling-place', true);
  act(() => obsoleteError()); // Obsolete decode callback cannot blank the retry.
  const retried = renderer.root.findAllByType(Image)[0]!;
  expect(retried.props.source.uri).toBe('file:///cache/2025-cooper-polling-place.webp');
  act(() => retried.props.onLoad());
  expect(renderer.root.findAllByProps({ testID: 'tm-photo-2025-cooper-polling-place-loaded' })).not.toHaveLength(0);
  act(() => renderer.unmount());
});
