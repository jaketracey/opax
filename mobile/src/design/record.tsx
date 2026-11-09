import { Linking, Pressable, View } from 'react-native';
import { copyText } from '../features/records/actions';
import { useAccessibilitySize } from './accessibility';
import { AUTHORISATION_LINE, CORRECTION_CONTACT } from './authorisation';
import { copy } from './copy';
import { type DateInput } from './format';
import { haptic } from './haptics';
import { Icon } from './icon';
import { confirmAction } from './menu';
import { useRowHighlight } from './row-padding';
import { SourceLine, type SourceDetails } from './source';
import { Text, type TextTone } from './text';
import {
  accents,
  colors,
  hairline,
  minimumTarget,
  rhythm,
  type Accent,
} from './tokens';

export type FigureSource = SourceDetails & {
  asOf: DateInput | null;
  citation: NonNullable<SourceDetails['citation']>;
  testID?: string;
};
/** A figure is always dated, including an explicit unknown date, and sourced. */
export function FigureBlock({
  value,
  ink,
  label,
  caveat,
  citation,
  accessibilityLabel,
  testID,
}: {
  value: string;
  ink?: Accent;
  label: string;
  caveat?: string;
  citation?: FigureSource;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={{ gap: rhythm.line }}>
      <View
        accessible
        accessibilityLabel={accessibilityLabel ?? `${value}, ${label}`}
      >
        <Text
          wordSafe
          variant="figure"
          tone={ink ? (accents[ink].ink as TextTone) : undefined}
        >
          {value}
        </Text>
        <Text wordSafe variant="secondary">
          {label}
        </Text>
      </View>
      {caveat ? (
        <Text wordSafe variant="footnote">
          {caveat}
        </Text>
      ) : null}
      {citation ? <SourceLine {...citation} /> : null}
    </View>
  );
}
export interface StatTileProps {
  value: string;
  label: string;
  ink?: Accent;
  onPress?: () => void;
  testID?: string;
}
const statChevron = 'chevron.right';
export function StatTile({
  value,
  label,
  ink,
  onPress,
  testID,
}: StatTileProps) {
  const highlight = useRowHighlight();
  const body = (
    <>
      <Text
        wordSafe
        variant="tileFigure"
        tone={ink ? (accents[ink].ink as TextTone) : undefined}
      >
        {value}
      </Text>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: rhythm.line }}
      >
        <Text wordSafe variant="footnote" style={{ flexShrink: 1 }}>
          {label}
        </Text>
        {onPress ? (
          <Icon name={statChevron} size={13} maxScale={1.5} tone="inkFaint" />
        ) : null}
      </View>
    </>
  );
  const props = {
    accessible: true,
    accessibilityLabel: `${value}, ${label}`,
    testID,
  };
  return onPress ? (
    <Pressable
      {...props}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        { minHeight: minimumTarget, gap: rhythm.line },
        pressed ? { backgroundColor: highlight } : null,
      ]}
    >
      {body}
    </Pressable>
  ) : (
    <View {...props} style={{ minHeight: minimumTarget, gap: rhythm.line }}>
      {body}
    </View>
  );
}
export function StatStrip({
  tiles,
  testID,
}: {
  tiles: StatTileProps[];
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  return (
    <View
      testID={testID}
      style={{ flexDirection: stacked ? 'column' : 'row', gap: rhythm.block }}
    >
      {tiles.map((tile, index) => (
        <View
          key={tile.testID ?? tile.label}
          style={stacked ? undefined : { flex: 1 }}
        >
          {index ? (
            <View
              style={
                stacked
                  ? {
                      height: hairline,
                      backgroundColor: colors.dividerSubtle,
                      marginBottom: rhythm.block,
                    }
                  : {
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: -rhythm.tight,
                      width: hairline,
                      backgroundColor: colors.dividerSubtle,
                    }
              }
            />
          ) : null}
          <StatTile {...tile} />
        </View>
      ))}
    </View>
  );
}
/** One correction entry point, including a copy fallback when Mail is unavailable. */
export async function openCorrection() {
  try {
    if (await Linking.canOpenURL(CORRECTION_CONTACT)) {
      await Linking.openURL(CORRECTION_CONTACT);
      return;
    }
  } catch {
    /* Offer the address when Mail cannot open. */
  }
  confirmAction(copy.correctionsEmail, [
    {
      title: copy.copyAddress,
      onPress: () => {
        void copyText(copy.correctionsEmail).then((copied) => {
          if (copied) haptic('success');
        });
      },
    },
  ]);
}
export function PageFoot({
  variant,
  testID,
  independenceTestID,
  correctionTestID,
}: {
  variant: 'today' | 'authorised';
  testID?: string;
  independenceTestID?: string;
  correctionTestID?: string;
}) {
  const highlight = useRowHighlight();
  return (
    <View
      testID={testID}
      style={{
        gap: rhythm.tight,
        alignItems: variant === 'today' ? 'center' : undefined,
      }}
    >
      {variant === 'today' ? (
        <Text
          wordSafe
          variant="footnote"
          tone="inkSoft"
          testID={independenceTestID}
          style={variant === 'today' ? { textAlign: 'center' } : undefined}
        >
          {copy.independence}
        </Text>
      ) : (
        <>
          <View
            style={{ height: hairline, backgroundColor: colors.dividerSubtle }}
          />
          <Text wordSafe variant="footnote" tone="inkSoft">
            {AUTHORISATION_LINE}
          </Text>
        </>
      )}
      <Pressable
        testID={correctionTestID}
        accessibilityRole="link"
        accessibilityLabel={
          variant === 'authorised'
            ? `Report a correction by email to ${copy.correctionsEmail}`
            : copy.reportCorrection
        }
        onPress={() => void openCorrection()}
        style={({ pressed }) => [
          { minHeight: minimumTarget, justifyContent: 'center' },
          pressed ? { backgroundColor: highlight } : null,
        ]}
      >
        {variant === 'today' ? (
          <Text wordSafe variant="footnote" tone="navy">
            {copy.reportCorrection}
          </Text>
        ) : (
          <>
            <Text wordSafe variant="footnote" tone="navy">
              Report a correction:
            </Text>
            <Text
              variant="footnote"
              tone="navy"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {copy.correctionsEmail}
            </Text>
          </>
        )}
      </Pressable>
      {variant === 'authorised' ? (
        <Text wordSafe variant="footnote" tone="inkSoft">
          We aim to respond within 2 business days.
        </Text>
      ) : null}
    </View>
  );
}
