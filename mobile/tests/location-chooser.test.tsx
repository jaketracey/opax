import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { LocationSuggestion } from '../src/features/electorate-map/LocationSuggestion';
import { suggestFromLocation } from '../src/features/electorate-map/location';
import { decodeElectorateIndex } from '../src/api/catalogs';
import { Button, Text } from '../src/design/primitives';
import { pinned } from './pinned';
jest.mock('../src/features/electorate-map/location', () => ({
  suggestFromLocation: jest.fn(),
}));
const seat = decodeElectorateIndex(
  pinned(
    (pinned('/electorates/manifest.json') as { index_url: string }).index_url,
  ),
).electorates.find((s) => s.name === 'Grayndler')!;
const find = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAllByType(Button).find((n) => n.props.testID === id)!;
beforeEach(() => jest.clearAllMocks());
test('permission work starts only after a tap, and a suggestion waits for confirmation', async () => {
  let r!: TestRenderer.ReactTestRenderer;
  const confirm = jest.fn();
  (suggestFromLocation as jest.Mock).mockResolvedValue({
    kind: 'suggested',
    seat,
    vintage: '2028 election',
  });
  await act(async () => {
    r = TestRenderer.create(
      <LocationSuggestion
        seats={[seat]}
        onConfirm={confirm}
        disabled={false}
      />,
    );
  });
  expect(suggestFromLocation).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
  await act(async () => find(r, 'use-my-location').props.onPress());
  expect(confirm).not.toHaveBeenCalled();
  expect(find(r, 'location-confirm').props.label).toBe('Confirm Grayndler');
  // The vintage is the one the outlines carry, not a year written in the app.
  expect(
    r.root
      .findAllByType(Text)
      .flatMap((n) => n.props.children)
      .filter((v) => typeof v === 'string')
      .join(''),
  ).toContain('Suggestion from AEC 2028 election display outlines.');
  await act(async () => find(r, 'location-confirm').props.onPress());
  expect(confirm).toHaveBeenCalledWith(seat);
  await act(async () => r.unmount());
});
test.each(['denied', 'no-match', 'border', 'unavailable'])(
  '%s leaves the manual choice to the parent',
  async (kind) => {
    (suggestFromLocation as jest.Mock).mockResolvedValue({ kind });
    const confirm = jest.fn();
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(
        <LocationSuggestion
          seats={[seat]}
          onConfirm={confirm}
          disabled={false}
        />,
      );
    });
    await act(async () => find(r, 'use-my-location').props.onPress());
    expect(
      r.root.findAll((n) => n.props.testID === `location-${kind}`).length,
    ).toBeGreaterThan(0);
    expect(confirm).not.toHaveBeenCalled();
    expect(find(r, 'use-my-location').props.disabled).toBe(false);
    await act(async () => r.unmount());
  },
);
test('cancellation ignores a delayed result and allows another request', async () => {
  let finish!: (value: unknown) => void;
  (suggestFromLocation as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  let r!: TestRenderer.ReactTestRenderer;
  const confirm = jest.fn();
  await act(async () => {
    r = TestRenderer.create(
      <LocationSuggestion
        seats={[seat]}
        onConfirm={confirm}
        disabled={false}
      />,
    );
  });
  await act(async () => find(r, 'use-my-location').props.onPress());
  expect(find(r, 'use-my-location').props.disabled).toBe(true);
  await act(async () => find(r, 'location-cancel').props.onPress());
  expect((suggestFromLocation as jest.Mock).mock.calls[0][2].aborted).toBe(
    true,
  );
  await act(async () =>
    finish({ kind: 'suggested', seat, vintage: '2025 election' }),
  );
  expect(find(r, 'location-confirm')).toBeUndefined();
  expect(confirm).not.toHaveBeenCalled();
  await act(async () => r.unmount());
});
