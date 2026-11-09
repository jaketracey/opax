import { act } from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  decodeElectorate,
  decodeElectorateIndex,
  electorateFor,
} from '../src/api/catalogs';
import { Icon } from '../src/design/icon';
import { symbols } from '../src/design/symbols';
import { rhythm } from '../src/design/tokens';
import { OutlineMap } from '../src/features/electorate-map/OutlineMap';
import { ElectorateCard } from '../src/features/your-mp/ElectorateCard';
import { pinned } from './pinned';

jest.mock('../src/design/row-link', () => ({
  ...jest.requireActual('../src/design/row-link'),
  RowLink: ({ children }: { children: React.ReactNode }) => children,
}));

const manifest = pinned('/electorates/manifest.json') as { index_url: string };
const index = decodeElectorateIndex(pinned(manifest.index_url));
const seat = index.electorates.find((item) => item.name === 'Grayndler')!;
const view = electorateFor(decodeElectorate(pinned(seat.detail_url)));

test.each([true, false])(
  'the electorate disclosure uses the full trailing edge, with outline %s',
  (outline) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ElectorateCard
          seat={seat}
          view={{ ...view, boundaries: outline ? view.boundaries : [] }}
        />,
      );
    });
    try {
      expect(
        renderer.root
          .findAllByType(Icon)
          .filter((node) => node.props.name === symbols.chevron),
      ).toHaveLength(1);
      const election = renderer.root.findAllByType(View).find((node) => {
        const style = StyleSheet.flatten(node.props.style);
        return (
          style?.flexDirection === 'row' && style.alignItems === 'flex-end'
        );
      })!;
      expect(StyleSheet.flatten(election.props.style)).toMatchObject({
        flexDirection: 'row',
        alignItems: 'flex-end',
      });
      const body = renderer.root
        .findAllByType(View)
        .find(
          (node) =>
            StyleSheet.flatten(node.props.style)?.padding === rhythm.block,
        )!;
      const copy = election
        .findAllByType(View)
        .find((node) => StyleSheet.flatten(node.props.style)?.flex === 1)!;
      expect(StyleSheet.flatten(copy.props.style)).toMatchObject({ flex: 1 });
      expect(StyleSheet.flatten(body.props.style)).toMatchObject({
        padding: rhythm.block,
        ...(outline ? { paddingTop: 0 } : {}),
      });
      expect(renderer.root.findAllByType(OutlineMap)).toHaveLength(
        outline ? 1 : 0,
      );
    } finally {
      act(() => renderer.unmount());
    }
  },
);
