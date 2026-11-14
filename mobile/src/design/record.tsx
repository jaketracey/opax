import {
  Linking,
  View,
  type AccessibilityActionEvent,
  type TextProps,
} from 'react-native';
import { Pressable } from './pressable';
import type { Href } from 'expo-router';
import { useRecordLink } from '../navigation/record-link';
import { copyText } from '../features/records/actions';
import { useAccessibilitySize } from './accessibility';
import { AUTHORISATION_LINE, CORRECTION_CONTACT } from './authorisation';
import { copy } from './copy';
import { spokenFigures, type DateInput } from './format';
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
  type TextVariant,
} from './tokens';
import type { TermId } from '../features/learn/glossary';
import { TermIn, withTermAction } from './term';

/** A named record inside another target keeps its own destination. */
export function RecordNameLink({
  name,
  href,
  variant = 'body',
  testID,
  style,
  accessibilityLabel,
}: {
  name: string;
  href?: Href;
  variant?: TextVariant;
  testID?: string;
  style?: TextProps['style'];
  accessibilityLabel?: string;
}) {
  const link = useRecordLink(href);
  return (
    <Text
      wordSafe
      variant={variant}
      tone={href ? 'link' : undefined}
      accessibilityRole={href ? 'link' : undefined}
      accessibilityLabel={
        href ? (accessibilityLabel ?? `Open ${name}`) : undefined
      }
      onPress={
        href
          ? (event) => {
              event.stopPropagation();
              link.open();
            }
          : undefined
      }
      testID={testID}
      style={style}
    >
      {name}
    </Text>
  );
}

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
        accessibilityLabel={
          accessibilityLabel ?? spokenFigures(`${value}, ${label}`)
        }
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
  /** The glossary term in `label` ("divisions"), marked inline. */
  term?: TermId | null;
  testID?: string;
}
const statChevron = 'chevron.right';
export function StatTile({
  value,
  label,
  ink,
  onPress,
  term,
  testID,
}: StatTileProps) {
  const termAction = withTermAction([], term);
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
      <Text wordSafe variant="footnote">
        <TermIn text={label} term={term} />
        {onPress ? (
          <>
            {'\u00a0'}
            <Icon name={statChevron} size={13} maxScale={1.5} tone="inkFaint" />
          </>
        ) : null}
      </Text>
    </>
  );
  const props = {
    accessible: true,
    accessibilityLabel: spokenFigures(`${value}, ${label}`),
    ...(term
      ? {
          accessibilityActions: termAction.actions,
          onAccessibilityAction: (event: AccessibilityActionEvent) =>
            void termAction.handle(event.nativeEvent.actionName),
        }
      : {}),
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
export async function openCorrection(email: string = copy.correctionsEmail) {
  const contact =
    email === copy.correctionsEmail ? CORRECTION_CONTACT : `mailto:${email}`;
  try {
    if (await Linking.canOpenURL(contact)) {
      await Linking.openURL(contact);
      return;
    }
  } catch {
    /* Offer the address when Mail cannot open. */
  }
  confirmAction(email, [
    {
      title: copy.copyAddress,
      onPress: () => {
        void copyText(email).then((copied) => {
          if (copied) haptic('success');
        });
      },
    },
  ]);
}
export function PageFoot({
  variant,
  line = AUTHORISATION_LINE,
  corrections,
  testID,
  independenceTestID,
  correctionTestID,
}: {
  variant: 'today' | 'authorised';
  line?: string;
  corrections?: { email: string; response: string };
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
            {line}
          </Text>
        </>
      )}
      <Pressable
        testID={correctionTestID}
        accessibilityRole="link"
        accessibilityLabel={
          variant === 'authorised'
            ? `Report a correction by email to ${corrections?.email ?? copy.correctionsEmail}`
            : copy.reportCorrection
        }
        onPress={() => void openCorrection(corrections?.email)}
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
            <Text variant="footnote" tone="navy">
              {corrections?.email ?? copy.correctionsEmail}
            </Text>
          </>
        )}
      </Pressable>
      {variant === 'authorised' ? (
        <Text wordSafe variant="footnote" tone="inkSoft">
          {corrections?.response ?? 'We aim to respond within 2 business days.'}
        </Text>
      ) : null}
    </View>
  );
}
