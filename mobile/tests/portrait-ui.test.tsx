import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Image } from 'react-native';
import { CachedPortrait } from '../src/features/CachedPortrait';
import { portraitFor } from '../src/api/selectors';
import { Portrait } from '../src/design/people';
const mockPortraitGet = jest.fn();
jest.mock('../src/api/runtime', () => ({
  portraits: { get: (request: unknown) => mockPortraitGet(request) },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => {
    if (!uri.startsWith('file:///cache/') || !uri.endsWith('.webp'))
      throw new Error('Outside local cache');
    return uri;
  },
}));
test('portrait reads local unaltered bytes, skips VoiceOver beside a name and falls back without initials', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Portrait
        name="Anthony Albanese"
        localURI="file:///cache/10007.webp"
        official
      />,
    );
  });
  const image = renderer.root.findByType(Image);
  expect(image.props.source.uri).toBe('file:///cache/10007.webp');
  expect(image.props.contentFit).toBe('contain');
  expect(image.props.cachePolicy).toBe('none');
  expect(image.props.useAppleWebpCodec).toBe(false);
  expect(image.props.allowDownscaling).toBe(false);
  expect(image.props.accessibilityIgnoresInvertColors).toBe(true);
  expect(image.props.accessibilityElementsHidden).toBe(true);
  expect(image.props.accessible).toBe(false);
  act(() => image.props.onError());
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).not.toContain('AA');
  act(() =>
    renderer.update(
      <Portrait
        name="Anthony Albanese"
        localURI="https://example.test/photos/10007.webp"
      />,
    ),
  );
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  act(() => renderer.unmount());
});
test.each([
  [true, 'Official portrait of Anthony Albanese'],
  [false, 'Photo of Anthony Albanese'],
])(
  'a standalone portrait has the correct accessible label',
  (official, label) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Portrait
          name="Anthony Albanese"
          localURI="file:///cache/10007.webp"
          official={official as boolean}
          nameBeside={false}
        />,
      );
    });
    expect(renderer.root.findByType(Image).props.accessibilityLabel).toBe(
      label,
    );
    expect(renderer.root.findByType(Image).props.accessible).toBe(true);
    act(() => renderer.unmount());
  },
);

test('credits follow native decode success, disappear on failure and ignore an obsolete image callback', async () => {
  const info = portraitFor(
    ['Anthony Albanese'],
    { 'anthony albanese': '10007' } as never,
    {},
  )!;
  mockPortraitGet.mockResolvedValue({
    info,
    localURI: 'file:///cache/10007.webp',
  });
  const onCredit = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <CachedPortrait
        name="Anthony Albanese"
        slug="anthony-albanese"
        onCredit={onCredit}
      />,
    );
  });
  expect(onCredit).toHaveBeenLastCalledWith(null);
  const image = renderer.root.findByType(Image);
  const oldOnDisplay = image.props.onDisplay;
  act(() => oldOnDisplay());
  expect(onCredit).toHaveBeenLastCalledWith(info);
  act(() => image.props.onError());
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  expect(onCredit).toHaveBeenLastCalledWith(null);
  await act(async () => {
    renderer.update(
      <CachedPortrait
        name="Anthony Albanese"
        slug="anthony-albanese"
        onCredit={onCredit}
        retryKey={1}
      />,
    );
  });
  expect(mockPortraitGet).toHaveBeenLastCalledWith({
    name: 'Anthony Albanese',
    slug: 'anthony-albanese',
    refresh: true,
  });
  expect(onCredit).toHaveBeenLastCalledWith(null);
  const count = onCredit.mock.calls.length;
  act(() => oldOnDisplay());
  expect(onCredit).toHaveBeenCalledTimes(count);
  act(() => renderer.root.findByType(Image).props.onDisplay());
  expect(onCredit).toHaveBeenLastCalledWith(info);
  mockPortraitGet.mockResolvedValue(null);
  await act(async () =>
    renderer.update(
      <CachedPortrait name="Walsh" slug="walsh" onCredit={onCredit} />,
    ),
  );
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  expect(onCredit).toHaveBeenLastCalledWith(null);
  act(() => renderer.unmount());
});
