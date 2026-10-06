// The design system's single import path for screens:
//   import { Screen, Section, PersonRow, AsAtLine } from '../design/primitives';
// Usage notes for every export are in src/design/README.md.
export { Text, Heading, type OpaxTextProps, type TextTone } from './text';
export {
  Button,
  IconButton,
  Tag,
  FilterChip,
  SegmentedControl,
  Field,
  Divider,
  type ButtonProps,
  type ButtonVariant,
  type Segment,
} from './controls';
export { Icon, type SFSymbol } from './icon';
export {
  Screen,
  KeyboardStableScreen,
  Group,
  Section,
  SubSection,
  RowList,
  KeyValueList,
  StatRow,
  type KeyValue,
  type Stat,
} from './layout';
export {
  Portrait,
  PartyLabel,
  PartyChip,
  PersonRow,
  type PersonRowProps,
} from './people';
export {
  AsAtLine,
  SourceLink,
  OpaxWebLink,
  Figure,
  MoneyFigure,
  BigFigure,
  type AsAtLineProps,
  type SourceLinkProps,
} from './record';
export { Disclosure, animateLayout } from './disclosure';
export { InfoButton, InfoSheet, type InfoNotes } from './info';
export { LinkRow, IconTile, ViewOriginal, type Original } from './rows';
export { haptic, type HapticKind } from './haptics';
export {
  LoadingState,
  EmptyState,
  ErrorState,
  OfflineBanner,
  StaleNotice,
  errorMessage,
  stateCopy,
} from './states';
export {
  LeadCard,
  type Lead,
  type LeadMetric,
  type LeadEvidence,
} from './lead';
export {
  useAccessibilitySize,
  useBoldText,
  useReduceMotion,
  useReduceMotionSetting,
} from './accessibility';
