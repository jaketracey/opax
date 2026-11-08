import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { Electorate } from '../../api/catalogs';
import { Button } from '../../design/controls';
import { InsetGroup } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import {
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from '../../design/row-padding';
import { Text } from '../../design/text';
import { Icon } from '../../design/icon';
import { symbols } from '../../design/symbols';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { suggestFromLocation } from '../electorate-map/location';
import {
  boundariesLine,
  locationAnswer,
  seatCopy,
  type LocationAnswer,
} from './seat-model';
import { SeatRow } from './SeatRow';

/** After this long in Finding, the row says it is still finding. */
export const SLOW_LOCATE_MS = 5000;

/**
 * "Use my location" in the chooser (first-launch 4.3, my-mp 8.2). The
 * permission is asked only at the tap (or on arrival with `locate=1`, which
 * is the reader's tap on "Use my location" elsewhere), and the fix never
 * leaves `suggestFromLocation`. The answer is drawn as ordinary seat rows:
 * "From your location", or "Near your location" for each candidate near a
 * line or inside an approximate fix. No checkmark until a row is chosen.
 *
 * Typing, opening Browse by state (`stopKey` changes) or tapping the row
 * again stops a locate and returns to Idle silently.
 */
export function LocationRow({
  seats,
  onChoose,
  accessory,
  disabled = false,
  autoStart = false,
  stopKey = 0,
}: {
  seats: () => Promise<Electorate[]>;
  onChoose: (seat: Electorate) => void;
  /** The row's trailing mark while a choice is written (chevron otherwise). */
  accessory: (id: string) => 'chevron' | 'saving' | 'checkmark';
  disabled?: boolean;
  autoStart?: boolean;
  stopKey?: number;
}) {
  const [answer, setAnswer] = useState<LocationAnswer>({ kind: 'idle' });
  const pending = useRef<AbortController | null>(null);
  const started = useRef(false);
  useEffect(() => () => pending.current?.abort(), []);

  const stop = () => {
    if (!pending.current) return;
    pending.current.abort();
    pending.current = null;
    setAnswer({ kind: 'idle' });
  };
  // A later stopKey (typing, Browse) stops a running locate.
  const firstKey = useRef(stopKey);
  useEffect(() => {
    if (stopKey !== firstKey.current) stop();
  }, [stopKey]);

  async function locate() {
    if (pending.current) {
      stop();
      return;
    }
    if (disabled) return;
    const controller = new AbortController();
    pending.current = controller;
    setAnswer({ kind: 'finding', slow: false });
    const slow = setTimeout(() => {
      if (!controller.signal.aborted)
        setAnswer({ kind: 'finding', slow: true });
    }, SLOW_LOCATE_MS);
    let result: Parameters<typeof locationAnswer>[0];
    try {
      result = await suggestFromLocation(
        await seats(),
        () => {},
        controller.signal,
      );
    } catch {
      result = { kind: 'unavailable' };
    }
    clearTimeout(slow);
    const cancelled = controller.signal.aborted;
    if (pending.current === controller) pending.current = null;
    if (cancelled) return;
    const next = locationAnswer(result, cancelled);
    setAnswer(next);
    AccessibilityInfo.announceForAccessibility(spoken(next));
  }
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const footnote = seatCopy.footnote();
  const settings = (
    <LinkRow
      key="settings"
      title={seatCopy.openSettings}
      external
      onPress={() => void Linking.openSettings()}
      testID="seat-location-settings"
    />
  );
  const useRow = (
    <ActionRow
      key="use"
      title={seatCopy.useLocation}
      onPress={() => void locate()}
      disabled={disabled}
      testID="use-my-location"
    />
  );
  const rows = (list: Electorate[], meta: string, single: boolean) =>
    list.map((seat) => (
      <SeatRow
        key={seat.electorate_id}
        seat={seat}
        meta={meta}
        onPress={() => onChoose(seat)}
        disabled={disabled && accessory(seat.electorate_id) === 'chevron'}
        accessory={accessory(seat.electorate_id)}
        testID={single ? 'seat-location-row' : `seat-location-row-${seat.slug}`}
      />
    ));
  let content: ReactNode[];
  let footer: ReactNode = footnote;
  let testID = 'seat-location';
  switch (answer.kind) {
    case 'finding':
      content = [
        <ActionRow
          key="finding"
          title={answer.slow ? seatCopy.stillFinding : seatCopy.finding}
          busy
          onPress={() => stop()}
          testID="seat-location-finding"
        />,
      ];
      break;
    case 'found':
      testID = answer.near ? 'location-border' : 'location-suggestion';
      content = rows(
        answer.seats,
        answer.near ? seatCopy.nearLocation : seatCopy.fromLocation,
        !answer.near,
      );
      footer = (
        <Footer
          lines={[boundariesLine(answer.vintage), footnote]}
          testID="location-boundaries"
        />
      );
      break;
    case 'approximate':
      testID = 'location-approximate';
      content = [
        <StatusRow key="approximate" text={seatCopy.approximate} />,
        ...rows(answer.seats, seatCopy.nearLocation, false),
      ];
      break;
    case 'message':
      content = [useRow, ...(answer.settings ? [settings] : [])];
      footer = (
        <Footer
          lines={[answer.text, footnote]}
          testID={
            answer.settings
              ? 'location-denied'
              : answer.text === seatCopy.outside
                ? 'location-no-match'
                : 'location-unavailable'
          }
        />
      );
      break;
    default:
      content = [useRow];
  }
  return (
    <InsetGroup footer={footer} testID={testID}>
      {content}
    </InsetGroup>
  );
}

function spoken(answer: LocationAnswer): string {
  switch (answer.kind) {
    case 'found':
      return answer.seats
        .map(
          (seat) =>
            `${seat.name}, ${(answer.near ? seatCopy.nearLocation : seatCopy.fromLocation).toLocaleLowerCase('en-AU')}`,
        )
        .join('. ');
    case 'approximate':
      return seatCopy.approximate;
    case 'message':
      return answer.text;
    default:
      return '';
  }
}

function Footer({ lines, testID }: { lines: string[]; testID?: string }) {
  return (
    <View style={styles.footer} testID={testID}>
      {lines.map((line) => (
        <Text
          key={line}
          wordSafe
          variant="footnote"
          accessibilityLiveRegion="polite"
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

/**
 * The location row as an action in the tint, no chevron. While finding it
 * stays where it was, dims and shows an indicator; a second tap stops it.
 */
function ActionRow({
  title,
  onPress,
  busy = false,
  disabled = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset(44);
  const tone = busy || disabled ? 'inkSoft' : 'navy';
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        pressed && !disabled ? { backgroundColor: highlight } : null,
      ]}
    >
      <Icon name={symbols.location} size={20} maxScale={1.5} tone={tone} />
      <Text wordSafe variant="body" tone={tone} style={styles.grow}>
        {title}
      </Text>
      {busy ? <ActivityIndicator color={colors.inkSoft} /> : null}
    </Pressable>
  );
}

/** Precise Location off: one line and the way to turn it on. */
function StatusRow({ text }: { text: string }) {
  const cellStyle = useRowCellStyle();
  return (
    <View style={[styles.status, cellStyle]}>
      <Text wordSafe variant="body" style={styles.grow}>
        {text}
      </Text>
      <Button
        label={seatCopy.openSettings}
        variant="plain"
        size="compact"
        onPress={() => void Linking.openSettings()}
        testID="seat-location-settings"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { gap: rhythm.line },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  status: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
});
