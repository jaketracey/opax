import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { Electorate } from '../../api/catalogs';
import { useAccessibilitySize } from '../../design/accessibility';
import { Icon } from '../../design/icon';
import { symbols } from '../../design/symbols';
import { PartyLabel, Portrait } from '../../design/people';
import {
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from '../../design/row-padding';
import { Text } from '../../design/text';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { CachedPortrait } from '../CachedPortrait';
import { seatCopy, seatLabel, seatMember, type PersonLead } from './seat-model';

const PORTRAIT = 44;
/** The chosen seat's mark (as rows.tsx draws a checkmark accessory). */
const chosen = 'checkmark';

/**
 * One seat in the chooser (specs/your-mp.md 4.4): the member's 44 pt
 * portrait (a blank circle when there is none), the seat in `strong`, then
 * the member and their party. No chamber or state: the scope and the browse
 * list already say them. Choosing closes the sheet, so it carries a chevron;
 * the saved seat carries a checkmark instead, and a row being saved an
 * activity indicator. `meta` is the location line ("From your location"),
 * drawn after a `location.fill` glyph. At accessibility sizes the portrait
 * sits above the text.
 */
export function SeatRow({
  seat,
  onPress,
  meta,
  detail,
  accessory = 'chevron',
  disabled = false,
  testID,
}: {
  seat: Electorate;
  onPress?: () => void;
  meta?: string;
  /** Replaces the member line ("Saved", the abolished-seat sentence). */
  detail?: string;
  accessory?: 'chevron' | 'checkmark' | 'saving' | 'none';
  disabled?: boolean;
  testID?: string;
}) {
  const member = seatMember(seat);
  const label = [seatLabel(seat, meta), detail ? `${detail}.` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <RowFrame
      onPress={onPress}
      disabled={disabled}
      selected={accessory === 'checkmark'}
      busy={accessory === 'saving'}
      label={label}
      hint={
        onPress && accessory !== 'checkmark' ? seatCopy.chooseHint : undefined
      }
      testID={testID}
      accessory={accessory}
      portrait={
        member ? (
          <CachedPortrait name={member.name} />
        ) : (
          <Portrait size={PORTRAIT} />
        )
      }
    >
      <Text wordSafe variant="strong">
        {seat.name}
      </Text>
      {detail ? (
        <Text wordSafe variant="secondary">
          {detail}
        </Text>
      ) : member ? (
        <View style={styles.memberLine}>
          <Text wordSafe variant="secondary">
            {member.name}
          </Text>
          {member.party ? (
            <PartyLabel
              party={member.party}
              status="current"
              linked={false}
              nested
            />
          ) : null}
        </View>
      ) : (
        <Text wordSafe variant="secondary">
          {seatCopy.noMember}
        </Text>
      )}
      {meta ? (
        <View style={styles.meta}>
          <Icon name={symbols.location} size={13} tone="navy" />
          <Text wordSafe variant="secondary">
            {meta}
          </Text>
        </View>
      ) : null}
    </RowFrame>
  );
}

/**
 * A senator or Victorian member matched by name (my-mp 3.3 item 2): it
 * cannot be chosen, so it pushes their state's Browse list instead.
 */
export function PersonLeadRow({
  lead,
  onPress,
  disabled,
}: {
  lead: PersonLead;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <RowFrame
      onPress={onPress}
      disabled={disabled}
      label={`${lead.name}, ${[lead.party, lead.detail].filter(Boolean).join(', ')}. ${lead.line}.`}
      hint={undefined}
      testID={`seat-person-lead-${lead.slug}`}
      accessory="chevron"
      portrait={<CachedPortrait name={lead.name} />}
    >
      <Text wordSafe variant="strong">
        {lead.name}
      </Text>
      <Text wordSafe variant="secondary">
        {lead.detail}
      </Text>
      <Text wordSafe variant="secondary" tone="navy">
        {lead.line}
      </Text>
    </RowFrame>
  );
}

function RowFrame({
  onPress,
  disabled,
  selected = false,
  busy = false,
  label,
  hint,
  testID,
  accessory,
  portrait,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  selected?: boolean;
  busy?: boolean;
  label: string;
  hint?: string;
  testID?: string;
  accessory: 'chevron' | 'checkmark' | 'saving' | 'none';
  portrait: ReactNode;
  children: ReactNode;
}) {
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset(stacked ? 16 : 16 + PORTRAIT + rhythm.tight);
  return (
    <Pressable
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, selected, busy }}
      disabled={disabled || !onPress}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        pressed && onPress && !disabled ? { backgroundColor: highlight } : null,
      ]}
    >
      <View style={[styles.main, stacked ? styles.stacked : null]}>
        {portrait}
        <View style={[styles.text, stacked ? null : styles.grow]}>
          {children}
        </View>
      </View>
      {accessory === 'saving' ? (
        <ActivityIndicator color={colors.inkSoft} />
      ) : accessory === 'checkmark' ? (
        <Icon name={chosen} size={15} tone="navy" weight="semibold" />
      ) : accessory === 'chevron' ? (
        <Icon name={symbols.chevron} size={13} maxScale={1.5} tone="inkSoft" />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  text: { gap: rhythm.line, flexShrink: 1 },
  grow: { flex: 1 },
  memberLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: rhythm.line },
});
