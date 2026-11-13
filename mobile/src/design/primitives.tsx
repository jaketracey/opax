export { Slider, Stepper } from './adjustable';
export type { AdjustableProps } from './adjustable';
// Canonical shared controls. Each public name has one explicit owner.
export {
  useAccessibilitySize,
  useBoldText,
  useHighTextContrast,
  useIncreaseContrast,
  useReduceMotion,
  useReduceMotionSetting,
} from './accessibility';
export {
  Grid,
  Hoverable,
  LayoutRegion,
  PadGrid,
  PadReading,
  ReadableColumn,
  RegionProvider,
  ScreenColumn,
  SidebarSafe,
  breakpoints,
  columnBreakout,
  currentRule,
  columns,
  dragWebUrl,
  gridColumns,
  isPad,
  pointerAvailable,
  readableInset,
  sizeClassFor,
  splitPane,
  splitPaneWidth,
  splitPanePhoneRegular,
  useWindowTraits,
  useAdaptiveDevice,
  setWindowTraitsOverride,
  ReservedRegionArea,
  ReservedRegionsProvider,
  useReservedRegions,
  useColumnChoice,
  useHover,
  useLayout,
  useMeasuredRegion,
  useScreenMargin,
} from './adaptive';
export type {
  GridColumns,
  Layout,
  LayoutRule,
  SizeClass,
  WindowTraits,
} from './adaptive';
export {
  activeVerticalFold,
  activeHorizontalFold,
  sidesOf,
  placeClear,
  evenColumns,
} from './fold';
export type { Rect, Region, ReservedRegions, FoldSides } from './fold';
export { Card, Tile, TileGrid, useInCard } from './card';
export { BarSeries, StageTimeline, VoteSplit } from './charts';
export type { ChartProvenance } from './charts';
export {
  Button,
  ChoiceChip,
  ChoiceChips,
  Composer,
  Divider,
  Field,
  FilterChip,
  FollowButton,
  IconButton,
  MonthPager,
  PopUpButton,
  SegmentedControl,
  SegmentedPicker,
  StepButtons,
  SwitchRow,
  Tag,
  buttonStates,
  iconButtonStates,
  popUpLabelInset,
  segmentLabel,
  segmentsFit,
  toggleStates,
} from './controls';
export type {
  ButtonProps,
  ButtonVariant,
  IconButtonVariant,
  PickerOption,
  Segment,
  Step,
} from './controls';
export { copy } from './copy';
export { thisDevice } from './device';
export { Disclosure } from './disclosure';
export {
  FilterFacet,
  FilterSheet,
  FilterYears,
  filterBar,
  filterRowValue,
  filterStore,
  registerFilterModel,
  useFilterState,
} from './filter-sheet';
export type {
  FilterChoice,
  FilterModel,
  FilterRow,
  FilterToggle,
  FilterToggleGroup,
  FilterValues,
} from './filter-sheet';
export { designFlags } from './flags';
export { haptic } from './haptics';
export type { HapticKind } from './haptics';
export { EXTERNAL_GLYPH, Icon } from './icon';
export type { SFSymbol } from './icon';
export {
  dispatchKeyCommand,
  installKeyCommands,
  keyCommandSpecs,
  onKeyCommand,
  requestFocus,
  searchTabRole,
  sections,
  takeFocusRequest,
  useFocusRequest,
  useKeyCommand,
  useKeyScope,
  useRefreshCommand,
} from './keyboard';
export type {
  FocusTarget,
  KeyCommandId,
  KeyCommandSpec,
  ScopedKeyCommand,
} from './keyboard';
export {
  MACHINE_LABEL,
  MachinePill,
  StatusCapsule,
  statusTone,
} from './labels';
export type { MachineNote } from './labels';
export {
  Group,
  InsetGroup,
  KeyboardStableScreen,
  Screen,
  ScreenHeader,
  ScreenTitleContext,
  Section,
  SectionHeader,
  TitleAnchor,
  TitleAnchorContext,
  TitleContentContext,
  useScreenColumn,
} from './layout';
export type { SectionAction, TitleScrollHandler } from './layout';
export { leadMetricText } from './lead';
export type { Lead, LeadEvidence, LeadMetric } from './lead';
export {
  COALITION_ORDER,
  MONEY_PARTY_GROUPS,
  PARTY_GROUPS,
  byPartyGroup,
  partyGroup,
  partyGroupLabel,
  partyOrder,
} from './party-groups';
export type {
  MoneyPartyGroup,
  PartyGroup,
  PartyListContext,
} from './party-groups';
export {
  FaceStack,
  PartyLabel,
  PersonRow,
  Portrait,
  partyDotSize,
} from './people';
export type { PersonRowProps } from './people';
export {
  FigureBlock,
  PageFoot,
  StatStrip,
  StatTile,
  openCorrection,
} from './record';
export type { FigureSource, StatTileProps } from './record';
export {
  RowLink,
  RowTrigger,
  menuLeaves,
  menuSections,
  rowAccessibilityActions,
  rowMenus,
  useRowFollow,
} from './row-link';
export type { RowMenuAction, RowMenuLeaf } from './row-link';
export {
  BillRow,
  DivisionRow,
  LinkRow,
  MoneyRow,
  RecordRow,
  SuggestionRow,
  ValueRow,
} from './rows';
export type {
  BillRowProps,
  DivisionRowProps,
  LinkRowProps,
  RecordRowProps,
} from './rows';
export {
  SourceAffordance,
  SourceLine,
  SourceLineGroup,
  licenceText,
  sourceCitations,
  sourceLineParts,
  updatedText,
} from './source';
export type {
  CitedSource,
  SourceCitation,
  SourceDetails,
  SourceOriginal,
  SourceState,
} from './source';
export {
  PaneBar,
  PaneHost,
  SplitLayout,
  useInSplitList,
  usePaneBar,
  useSplitCursor,
  useSplitPane,
} from './split';
export type { SplitLayoutProps, SplitPane } from './split';
export {
  Collapse,
  ContentUnavailable,
  CrossfadeLayers,
  EmptyState,
  ErrorState,
  InlineError,
  LoadingState,
  OfflineBanner,
  OfflineLine,
  Skeleton,
  SkeletonCrossfade,
  StatePageProvider,
  useSkeletonCrossfade,
  type SkeletonCrossfadeState,
  errorMessage,
  stateCopy,
} from './states';
export { symbolVocabulary, symbols } from './symbols';
export {
  Heading,
  LINE_HEIGHT_NUDGE,
  Text,
  breaksMidWord,
  lineScale,
  nextWordSafeCap,
  roleColour,
  textContent,
  titleSizeCap,
  wordSafeFloor,
  wordSafeOnFrame,
  wordSafeOnLines,
  wordSafeStart,
} from './text';
export type {
  OpaxTextProps,
  TextTone,
  WordSafeInstance,
  WordSafeState,
} from './text';
