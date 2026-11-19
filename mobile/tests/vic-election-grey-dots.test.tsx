// Election material draws every party in the same grey (Jake, 19 Nov 2026:
// "grey dots for all" until 6 pm on 28 November, as the web hub's party-grey).
// The hub's district list names who last held each seat at the 2022 election
// and their party; colour would mark out the parties that have one from the
// rest, so each dot is ink-faint, in light and dark, on iOS and Android.
import { mockVic, renderVic, resetVic } from './vic-election-render';
import * as Native from 'react-native';
import { Appearance, Platform, StyleSheet } from 'react-native';
import { PartyLabel } from '../src/design/people';
import { partyDot } from '../src/design/party';
import { currentColors } from '../src/design/use-colors';
import Hub from '../src/features/vic-election/Hub';
import { SeatRow } from '../src/features/vic-election/rows';

const originalOS = Platform.OS;
beforeEach(resetVic);
afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

function system(os: 'ios' | 'android', scheme: 'light' | 'dark') {
  Platform.OS = os;
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
  jest.spyOn(Native, 'useColorScheme').mockReturnValue(scheme);
}

/** The one hidden dot drawn inside a party label. */
function dotFill(label: { findAll: (f: (n: never) => boolean) => unknown[] }) {
  const fills = (
    label.findAll(
      (n: { type: unknown; props: Record<string, unknown> }) =>
        n.type === 'View' &&
        n.props.accessibilityElementsHidden === true &&
        StyleSheet.flatten(n.props.style as never)?.backgroundColor !==
          undefined,
    ) as { props: { style: unknown } }[]
  ).map((dot) => StyleSheet.flatten(dot.props.style as never)?.backgroundColor);
  expect(fills).toHaveLength(1);
  return fills[0];
}

test.each([
  ['ios', 'light'],
  ['ios', 'dark'],
  ['android', 'light'],
  ['android', 'dark'],
] as const)(
  'the hub district list draws no party colour (%s, %s)',
  (os, scheme) => {
    system(os, scheme);
    const r = renderVic(<Hub />);
    const labels = r.root.findAllByType(PartyLabel);
    expect(labels.length).toBeGreaterThan(0);
    const grey = currentColors().inkFaint;
    for (const label of labels) {
      expect(label.props.neutralDot).toBe(true);
      const fill = dotFill(label as never);
      expect(fill).toEqual(grey);
      expect(fill).not.toEqual(partyDot(label.props.party, scheme));
    }
  },
);

test('two parties with different colours draw the same grey dot', () => {
  const districts = mockVic.overview.record!.data.districts;
  const labor = districts.find((d) => d.member.party === 'Labor')!;
  const liberal = districts.find((d) => d.member.party === 'Liberal')!;
  expect(partyDot('Labor')).not.toEqual(partyDot('Liberal'));
  const fills = [labor, liberal].map((district) =>
    dotFill(
      renderVic(<SeatRow district={district} />).root.findByType(
        PartyLabel,
      ) as never,
    ),
  );
  expect(fills[0]).toEqual(fills[1]);
});

test.each(['light', 'dark'] as const)(
  'outside election material a party label keeps its colour (%s)',
  (scheme) => {
    system('ios', scheme);
    const r = renderVic(<PartyLabel party="Labor" nested />);
    expect(dotFill(r.root.findByType(PartyLabel) as never)).toEqual(
      partyDot('Labor', scheme),
    );
  },
);
