// An unmatched link shows ContentUnavailable with a way back, never the
// router's development "Unmatched Route" screen (explore-15 to 19).
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import NotFound from '../src/app/+not-found';
import { ContentUnavailable } from '../src/design/states';

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Stack: { Screen: () => null },
  router: { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

function render() {
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(<NotFound />);
  });
  return view;
}

test('with a page behind it, the action goes back', () => {
  jest.mocked(router.canGoBack).mockReturnValue(true);
  const view = render();
  const state = view.root.findByType(ContentUnavailable);
  expect(state.props.title).toBe('This page isn’t in the app');
  expect(state.props.action.label).toBe('Go back');
  act(() => state.props.action.onPress());
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
  act(() => view.unmount());
});

test('opened cold from a link, the action goes to Today', () => {
  jest.mocked(router.canGoBack).mockReturnValue(false);
  const view = render();
  const state = view.root.findByType(ContentUnavailable);
  expect(state.props.action.label).toBe('Go to Today');
  act(() => state.props.action.onPress());
  expect(router.replace).toHaveBeenCalledWith('/');
  act(() => view.unmount());
});
