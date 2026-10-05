import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Image } from 'react-native';
import { Portrait } from '../src/design/people';
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
  expect(image.props.resizeMode).toBe('contain');
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
