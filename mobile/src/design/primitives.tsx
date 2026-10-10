// The design system's single import path for screens:
//   import { Screen, Section, PersonRow, AsAtLine } from '../design/primitives';
// Usage notes for every export are in src/design/README.md.
export { Text, Heading, type OpaxTextProps, type TextTone } from './text';
export {
  Button,
  IconButton,
  FilterChip,
  SegmentedControl,
  ChoiceChips,
  SwitchRow,
  Field,
  Composer,
  Divider,
  StepButtons,
  type ButtonProps,
  type Step,
  type ButtonVariant,
  type IconButtonVariant,
  type Segment,
} from './controls';
export {
  StatusLabel,
  statusTone,
  Tag,
  ChoiceChip,
  MachineLabel,
  MACHINE_BRIEF_EXPLANATION,
  MACHINE_GUIDANCE,
  MACHINE_LABEL,
} from './labels';
export {
  SourceLine,
  SourceSheet,
  sourceLineParts,
  type SourceDetails,
  type SourceOriginal,
  type SourceState,
} from './source';
export { Card, useInCard } from './card';
export { Icon, type SFSymbol } from './icon';
export { MachineWritten } from './machine';
export {
  Screen,
  KeyboardStableScreen,
  Group,
  Section,
  SubSection,
  EdgeFade,
  RowList,
  KeyValueList,
  StatRow,
  useScreenColumn,
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
export {
  useLayout,
  sizeClassFor,
  LayoutRegion,
  RegionProvider,
  ReadableColumn,
  readableInset,
  Grid,
  PadGrid,
  PadReading,
  gridColumns,
  Hoverable,
  SidebarSafe,
  useHover,
  isPad,
  breakpoints,
  columns,
  splitPane,
  splitPaneWidth,
  ScreenColumn,
  type Layout,
  type SizeClass,
  type GridColumns,
} from './adaptive';
export {
  SplitLayout,
  SplitEmpty,
  useSplitPane,
  useSplitCursor,
  PaneHost,
  PaneBar,
  type SplitPane,
  type SplitLayoutProps,
} from './split';
export {
  useKeyCommand,
  requestFocus,
  useFocusRequest,
  type KeyCommandId,
} from './keyboard';
