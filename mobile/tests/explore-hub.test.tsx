import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import ExploreHub from '../src/features/explore/Hub';
import { apiClient } from '../src/api/runtime';
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({
  apiClient: { getForAction: jest.fn(), get: jest.fn() },
}));
test('mounting and re-rendering the Explore hub never calls a paid or static reader', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ExploreHub />);
  });
  act(() => renderer.update(<ExploreHub />));
  expect(apiClient.getForAction).not.toHaveBeenCalled();
  expect(apiClient.get).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});
