import { act, useEffect } from 'react';
import TestRenderer from 'react-test-renderer';
import { useCaptionsPreference } from '../src/features/talk/captions-preference';

const mockDisk = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_directory: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return mockDisk.has(this.name);
    }
    async text() {
      return mockDisk.get(this.name)!;
    }
    write(body: string) {
      mockDisk.set(this.name, body);
    }
  },
}));

let current: ReturnType<typeof useCaptionsPreference>;
function Probe() {
  const value = useCaptionsPreference();
  useEffect(() => {
    current = value;
  });
  return null;
}
async function mount() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Probe />);
  });
  return renderer;
}
beforeEach(() => mockDisk.clear());

test('captions start off and the switch is remembered, never a caption', async () => {
  let renderer = await mount();
  expect(current[0]).toBe(false);
  await act(async () => current[1](true));
  expect(current[0]).toBe(true);
  expect([...mockDisk.values()].join()).toMatch(
    /^\{"on":true,"generation":1\}$/,
  );
  act(() => renderer.unmount());
  renderer = await mount();
  expect(current[0]).toBe(true);
  act(() => renderer.unmount());
});

test('an unreadable or foreign file leaves captions off', async () => {
  mockDisk.set('opax-talk-captions-v1.json', '{"on":"yes"}');
  mockDisk.set('opax-talk-captions-v1.b.json', 'not json');
  const renderer = await mount();
  expect(current[0]).toBe(false);
  act(() => renderer.unmount());
});

test('a choice made while the file is read wins over the stored one', async () => {
  mockDisk.set('opax-talk-captions-v1.json', '{"on":true,"generation":1}');
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
  act(() => current[1](false));
  await act(async () => {});
  expect(current[0]).toBe(false);
  act(() => renderer.unmount());
});
