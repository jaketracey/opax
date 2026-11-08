// opax/deprecated-design: blocks the design recipes that pass 2B retired
// (docs/design/DESIGN-REVIEW-2026-10.md 5.3) from coming back in new code.
// The adapters still in use are counted by tests/deprecated-recipes.test.ts,
// which only lets their uses go down.

const ROLES = {
  title: 'recordTitle',
  display: 'figure',
  heading: 'sectionTitle',
  subheading: 'rowRecord',
  record: 'recordText',
  metadata: 'secondary',
  fine: 'footnote',
  label: 'capsule',
  control: 'strong',
  padTitle: 'recordTitle',
  padLede: 'body',
  lede: 'body',
  caption: 'footnote',
  figureInline: 'strong with tabular',
  tag: 'capsule',
  kicker: 'capsule',
  chip: 'capsule',
  countdown: 'strong with tabular',
};
// Retired components: zero uses outside src/design, which keeps any alias.
// Aliases still in use (UpdatedCaption, VoteSide, AsAtLine, SourceLink, ...)
// are counted by the ratchet test instead.
const COMPONENTS = {
  BillStatus: 'StatusLabel',
  RoundButton: 'IconButton (size="large")',
  PartyChip: 'PartyLabel (dense, linked={false})',
  MachineWritten: 'MachineLabel',
  SplitEmpty: 'EmptyState size="pane"',
  TodayCard: 'Card',
  ToggleRow: 'SwitchRow',
  MoneyToggle: 'SwitchRow',
  InlineLink: 'LinkRow',
  Chip: 'StatusLabel, Tag, PartyLabel or ChoiceChip',
};

const literal = (node) =>
  node && node.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : null;
const attributeValue = (attribute) => {
  const value = attribute.value;
  if (!value) return null;
  if (value.type === 'Literal') return literal(value);
  if (value.type === 'JSXExpressionContainer') return literal(value.expression);
  return null;
};

const deprecatedRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      role: 'Type role "{{name}}" is deprecated: use {{use}}.',
      places: 'The "places" accent is deprecated: use "people".',
      component: '{{name}} is retired: use {{use}}.',
      uppercase:
        'No uppercase or letter-spaced labels (D6): write labels in sentence case.',
      staticLightReads:
        'Static light palette reads are deprecated: use colours resolved for the appearance.',
      spacing: 'The spacing scale is deprecated: use rhythm.',
      radius: 'Radius {{name}} is deprecated: use {{use}}.',
      bronze: 'Bronze text is retired: use the link tone (navy).',
      tint: 'Derived tints are retired: use accentTint or statusTint from design/tokens.',
    },
  },
  create(context) {
    const file = context.filename.replace(/\\/g, '/');
    // The design system keeps the aliases; everything else uses the new names.
    const inDesign = /\/src\/design\//.test(file);
    return {
      JSXAttribute(node) {
        const name = node.name && node.name.name;
        const value = attributeValue(node);
        if (name === 'variant' && value && ROLES[value])
          context.report({
            node,
            messageId: 'role',
            data: { name: value, use: ROLES[value] },
          });
        if (name === 'tone' && value === 'bronzeInk')
          context.report({ node, messageId: 'bronze' });
        if (name === 'accent' && value === 'places')
          context.report({ node, messageId: 'places' });
      },
      // variant={cond ? 'caption' : 'body'}
      'JSXAttribute[name.name="variant"] ConditionalExpression > Literal'(
        node,
      ) {
        const value = literal(node);
        if (value && ROLES[value])
          context.report({
            node,
            messageId: 'role',
            data: { name: value, use: ROLES[value] },
          });
      },
      MemberExpression(node) {
        const object = node.object.name;
        const property = node.computed
          ? literal(node.property)
          : node.property.name;
        if (object === 'light')
          context.report({ node, messageId: 'staticLightReads' });
        if (object === 'spacing')
          context.report({ node, messageId: 'spacing' });
        if (object === 'radii' && ['sm', 'md', 'pill'].includes(property))
          context.report({
            node,
            messageId: 'radius',
            data: {
              name: property,
              use: { sm: 'bar', md: 'container', pill: 'capsule' }[property],
            },
          });
        if (object === 'textStyles' && ROLES[property])
          context.report({
            node,
            messageId: 'role',
            data: { name: property, use: ROLES[property] },
          });
      },
      JSXOpeningElement(node) {
        if (inDesign) return;
        const name = node.name && node.name.name;
        if (name && COMPONENTS[name])
          context.report({
            node,
            messageId: 'component',
            data: { name, use: COMPONENTS[name] },
          });
      },
      ImportDeclaration(node) {
        if (/today\/tint$/.test(node.source.value))
          context.report({ node, messageId: 'tint' });
      },
      Property(node) {
        if (inDesign) return;
        const key = node.key && (node.key.name || node.key.value);
        if (key === 'letterSpacing' || key === 'textTransform')
          context.report({ node, messageId: 'uppercase' });
      },
      CallExpression(node) {
        if (inDesign) return;
        const callee = node.callee;
        // `label.toLocaleUpperCase()` straight into JSX text is an uppercase
        // label; codes (state, ABN type) keep toUpperCase on purpose.
        if (
          callee.type === 'MemberExpression' &&
          callee.property.name === 'toLocaleUpperCase' &&
          node.parent &&
          node.parent.type === 'JSXExpressionContainer'
        )
          context.report({ node, messageId: 'uppercase' });
      },
    };
  },
};

const warningRule = (messages, create) => ({
  meta: { type: 'suggestion', schema: [], messages },
  create,
});
const attributes = (node) =>
  Object.fromEntries(
    node.attributes
      .filter((a) => a.type === 'JSXAttribute')
      .map((a) => [a.name.name, attributeValue(a)]),
  );
const categoryInks = new Set([
  'billsInk',
  'moneyInk',
  'votesInk',
  'interestsInk',
]);
const rules = {
  'deprecated-design': deprecatedRule,
  'category-ink': warningRule(
    {
      category:
        'Category ink belongs only to subject figures or hierarchical symbols.',
    },
    (context) => ({
      JSXOpeningElement(node) {
        const name = node.name.name;
        const a = attributes(node);
        if (!categoryInks.has(a.tone) && !categoryInks.has(a.ink)) return;
        if (name === 'Text' && ['figure', 'tileFigure'].includes(a.variant))
          return;
        if (name === 'Icon' && a.type === 'hierarchical') return;
        context.report({ node, messageId: 'category' });
      },
    }),
  ),
  'symbol-vocabulary': warningRule(
    {
      symbol:
        'Use the shared symbols vocabulary instead of an Icon name literal.',
    },
    (context) => ({
      JSXOpeningElement(node) {
        if (
          node.name.name !== 'Icon' ||
          /[\/]symbols\.ts$/.test(context.filename)
        )
          return;
        const name = node.attributes.find(
          (a) => a.type === 'JSXAttribute' && a.name.name === 'name',
        );
        if (!name) return;
        const value = name.value;
        const containsLiteral = (n) =>
          !!n &&
          (literal(n) !== null ||
            (n.type === 'ConditionalExpression' &&
              (containsLiteral(n.consequent) || containsLiteral(n.alternate))));
        if (
          containsLiteral(
            value?.type === 'JSXExpressionContainer' ? value.expression : value,
          )
        )
          context.report({ node: name, messageId: 'symbol' });
      },
    }),
  ),
  'continuous-corners': warningRule(
    { corners: 'Set borderCurve: continuous beside every borderRadius.' },
    (context) => ({
      ObjectExpression(node) {
        const properties = node.properties.filter((p) => p.type === 'Property');
        const key = (p) => p.key.name || p.key.value;
        const radius = properties.find((p) =>
          /^(borderRadius|border(Top|Bottom)(Left|Right)Radius)$/.test(key(p)),
        );
        if (
          radius &&
          !properties.some(
            (p) =>
              key(p) === 'borderCurve' && literal(p.value) === 'continuous',
          )
        )
          context.report({ node: radius, messageId: 'corners' });
      },
    }),
  ),
  'show-menu': warningRule(
    { menu: 'Use RowLink or a bar menu instead of showMenu outside design/.' },
    (context) => {
      const inDesign = /[\/]src[\/]design[\/]/.test(context.filename);
      const names = new Set(['showMenu']);
      return {
        ImportSpecifier(node) {
          if (node.imported.name === 'showMenu') names.add(node.local.name);
        },
        CallExpression(node) {
          if (!inDesign && names.has(node.callee.name))
            context.report({ node, messageId: 'menu' });
        },
      };
    },
  ),
};

// Per-file counts measured on 8 November 2026. New files start at zero.
// Named warning rules are exported for the shared ESLint config to register.
// The existing deprecated-design config stays usable before that follow-up.
const ratchetBaseline = {
  'deprecated-design/staticLightReads': {
    'src/app/_layout.tsx': 1,
    'src/design/contrast.ts': 3,
    'src/design/layout.tsx': 2,
    'src/design/people.tsx': 5,
    'src/design/text.tsx': 1,
    'src/design/tokens.ts': 4,
    'src/features/electorate-map/OutlineMap.tsx': 2,
    'src/features/explore/Picture.tsx': 3,
    'src/features/talk/VoiceOrb.tsx': 1,
    'src/navigation/AndroidReadingHeader.tsx': 5,
    'src/navigation/chrome.ts': 3,
    'src/navigation/external.ts': 1,
    'src/onboarding/PadTour.tsx': 2,
    'src/workbench/Workbench.tsx': 3,
  },
  'deprecated-design/radius': {
    'src/design/card.tsx': 1,
    'src/design/controls.tsx': 12,
    'src/design/info.tsx': 1,
    'src/design/labels.tsx': 6,
    'src/design/rows.tsx': 1,
    'src/design/selection.tsx': 1,
    'src/design/source.tsx': 2,
    'src/design/split.tsx': 1,
    'src/design/states.tsx': 2,
    'src/features/Person.tsx': 2,
    'src/features/bills/parts.tsx': 1,
    'src/features/electorate-map/LocationSuggestion.tsx': 1,
    'src/features/electorate-map/OutlineMap.tsx': 1,
    'src/features/leads/Chart.tsx': 1,
    'src/features/records/BillTextReader.tsx': 1,
    'src/features/today/EditionHero.tsx': 1,
    'src/features/today/ExploreGrid.tsx': 1,
    'src/navigation/AndroidSheet.tsx': 2,
    'src/navigation/AndroidTabs.tsx': 1,
    'src/onboarding/PadTour.tsx': 1,
  },
  'deprecated-design/role': {
    'src/design/controls.tsx': 10,
    'src/design/disclosure.tsx': 1,
    'src/design/labels.tsx': 4,
    'src/design/layout.tsx': 3,
    'src/design/lead.tsx': 7,
    'src/design/people.tsx': 5,
    'src/design/record.tsx': 5,
    'src/design/rows.tsx': 5,
    'src/design/source.tsx': 6,
    'src/design/split.tsx': 1,
    'src/design/states.tsx': 2,
    'src/features/About.tsx': 2,
    'src/features/CatalogNotice.tsx': 2,
    'src/features/ComingSoon.tsx': 2,
    'src/features/Electorate.tsx': 3,
    'src/features/Party.tsx': 5,
    'src/features/Person.tsx': 16,
    'src/features/Placeholder.tsx': 1,
    'src/features/RecordStatus.tsx': 1,
    'src/features/Search.tsx': 1,
    'src/features/YourMP.tsx': 5,
    'src/features/account/AccountSection.tsx': 2,
    'src/features/account/DeleteAccountFlow.tsx': 1,
    'src/features/account/SignInFlow.tsx': 4,
    'src/features/ask/AnswerSources.tsx': 4,
    'src/features/ask/AnswerView.tsx': 3,
    'src/features/ask/AskProgress.tsx': 2,
    'src/features/ask/AskScreen.tsx': 2,
    'src/features/ask/Options.tsx': 1,
    'src/features/ask/QuestionBuilder.tsx': 1,
    'src/features/ask/SourcesPane.tsx': 4,
    'src/features/ask/choices.tsx': 1,
    'src/features/bills/BillDetail.tsx': 16,
    'src/features/bills/BillsList.tsx': 1,
    'src/features/bills/parts.tsx': 7,
    'src/features/community/CommunityScreen.tsx': 12,
    'src/features/declarations/Declarations.tsx': 2,
    'src/features/declarations/FeedRow.tsx': 2,
    'src/features/directories/DirectoryChoice.tsx': 1,
    'src/features/directories/DirectoryScreen.tsx': 1,
    'src/features/directories/DivisionHistory.tsx': 2,
    'src/features/directories/ElectorateHistory.tsx': 2,
    'src/features/directories/PartyDirectoryRow.tsx': 2,
    'src/features/electorate-map/LocationSuggestion.tsx': 4,
    'src/features/explore/Ballot.tsx': 3,
    'src/features/explore/Matrix.tsx': 2,
    'src/features/explore/PhotoCredits.tsx': 2,
    'src/features/explore/Picture.tsx': 1,
    'src/features/explore/Quiz.tsx': 4,
    'src/features/explore/Tide.tsx': 1,
    'src/features/explore/TimeMachine.tsx': 1,
    'src/features/explore/WordsDollars.tsx': 4,
    'src/features/explore/YearPictures.tsx': 1,
    'src/features/follows/FollowToggle.tsx': 1,
    'src/features/follows/FollowingSection.tsx': 3,
    'src/features/follows/ManageFollows.tsx': 3,
    'src/features/follows/SwipeRow.tsx': 1,
    'src/features/leads/Chart.tsx': 2,
    'src/features/leads/LeadDetail.tsx': 2,
    'src/features/leads/LeadFeedCard.tsx': 4,
    'src/features/leads/Leads.tsx': 3,
    'src/features/money/MoneyControls.tsx': 2,
    'src/features/money/MoneyMapLabels.tsx': 1,
    'src/features/money/MoneyNodeScreen.tsx': 4,
    'src/features/money/MoneyScreen.tsx': 2,
    'src/features/money-public/Agencies.tsx': 4,
    'src/features/money-public/Allocation.tsx': 5,
    'src/features/money-public/Connections.tsx': 1,
    'src/features/money-public/Hub.tsx': 1,
    'src/features/money-public/Largest.tsx': 1,
    'src/features/money-public/Program.tsx': 4,
    'src/features/money-public/parts.tsx': 2,
    'src/features/people/DeclaredInterests.tsx': 3,
    'src/features/people/ExpenseGlossary.tsx': 2,
    'src/features/people/FinancialBlocks.tsx': 5,
    'src/features/people/PartyDepth.tsx': 4,
    'src/features/people/Sections.tsx': 6,
    'src/features/records/BillTextReader.tsx': 3,
    'src/features/records/CitationScreen.tsx': 2,
    'src/features/records/DocumentReader.tsx': 4,
    'src/features/records/ReaderList.tsx': 1,
    'src/features/reports/ReportPage.tsx': 2,
    'src/features/reports/TodayReports.tsx': 2,
    'src/features/reports/TopicPage.tsx': 1,
    'src/features/reports/TopicsIndex.tsx': 2,
    'src/features/reports/parts.tsx': 4,
    'src/features/search/Excerpt.tsx': 1,
    'src/features/search/FiltersSheet.tsx': 1,
    'src/features/search/ResultRow.tsx': 3,
    'src/features/search/Results.tsx': 1,
    'src/features/sources/SourcesScreen.tsx': 8,
    'src/features/talk/AnswerCaption.tsx': 2,
    'src/features/talk/Consent.tsx': 3,
    'src/features/talk/TalkScreen.tsx': 5,
    'src/features/today/DeclarationRow.tsx': 1,
    'src/features/today/EditionHero.tsx': 9,
    'src/features/today/ExploreGrid.tsx': 1,
    'src/features/today/Foot.tsx': 2,
    'src/features/today/Masthead.tsx': 1,
    'src/features/today/StageLine.tsx': 2,
    'src/navigation/AndroidSheet.tsx': 2,
    'src/navigation/chrome.ts': 2,
    'src/onboarding/PadTour.tsx': 3,
    'src/onboarding/WelcomeTour.tsx': 2,
    'src/onboarding/padScenes.tsx': 11,
    'src/onboarding/scenes.tsx': 11,
    'src/test-screens/MoneyMapSpike.tsx': 4,
    'src/workbench/TalkOrbs.tsx': 1,
    'src/workbench/Workbench.tsx': 10,
  },
  'continuous-corners/corners': {
    'src/design/controls.tsx': 8,
    'src/design/info.tsx': 1,
    'src/design/labels.tsx': 4,
    'src/design/layout.tsx': 1,
    'src/design/people.tsx': 2,
    'src/design/rows.tsx': 1,
    'src/design/selection.tsx': 1,
    'src/design/source.tsx': 2,
    'src/design/split.tsx': 1,
    'src/design/states.tsx': 3,
    'src/features/Party.tsx': 1,
    'src/features/Person.tsx': 2,
    'src/features/ask/AskProgress.tsx': 3,
    'src/features/bills/BillDetail.tsx': 2,
    'src/features/bills/parts.tsx': 3,
    'src/features/community/CommunityScreen.tsx': 1,
    'src/features/electorate-map/LocationSuggestion.tsx': 3,
    'src/features/electorate-map/OutlineMap.tsx': 1,
    'src/features/follows/FollowingSection.tsx': 1,
    'src/features/leads/Chart.tsx': 1,
    'src/features/leads/LeadFeedCard.tsx': 1,
    'src/features/money/MoneyControls.tsx': 1,
    'src/features/money/NativeMoneyMap.tsx': 1,
    'src/features/records/BillTextReader.tsx': 1,
    'src/features/today/EditionHero.tsx': 1,
    'src/features/today/StageLine.tsx': 1,
    'src/navigation/AndroidSheet.tsx': 1,
    'src/navigation/AndroidTabs.tsx': 1,
    'src/onboarding/PadTour.tsx': 1,
    'src/onboarding/WelcomeTour.tsx': 1,
    'src/onboarding/padScenes.tsx': 3,
    'src/test-screens/VoiceBridgeTestScreen.tsx': 1,
    'src/workbench/Workbench.tsx': 2,
  },
  'symbol-vocabulary/symbol': {
    'src/design/controls.tsx': 3,
    'src/design/disclosure.tsx': 1,
    'src/design/info.tsx': 1,
    'src/design/labels.tsx': 1,
    'src/design/lead.tsx': 1,
    'src/design/people.tsx': 1,
    'src/design/rows.tsx': 2,
    'src/design/source.tsx': 1,
    'src/design/split.tsx': 1,
    'src/design/states.tsx': 2,
    'src/features/ask/AskProgress.tsx': 1,
    'src/features/bills/parts.tsx': 1,
    'src/features/community/CommunityScreen.tsx': 1,
    'src/features/declarations/Declarations.tsx': 1,
    'src/features/directories/DirectoryChoice.tsx': 1,
    'src/features/directories/PartyDirectoryRow.tsx': 1,
    'src/features/follows/FollowingSection.tsx': 1,
    'src/features/follows/ManageFollows.tsx': 1,
    'src/features/follows/SwipeRow.tsx': 1,
    'src/features/leads/Chart.tsx': 1,
    'src/features/leads/LeadDetail.tsx': 1,
    'src/features/leads/LeadFeedCard.tsx': 1,
    'src/features/search/FiltersSheet.tsx': 2,
    'src/navigation/AndroidReadingHeader.tsx': 1,
    'src/onboarding/padScenes.tsx': 3,
  },
  'deprecated-design/spacing': {
    'src/design/controls.tsx': 26,
    'src/design/layout.tsx': 5,
    'src/design/lead.tsx': 10,
    'src/design/states.tsx': 8,
    'src/design/useStableKeyboard.ts': 2,
    'src/features/ask/AskProgress.tsx': 5,
    'src/features/ask/AskScreen.tsx': 1,
    'src/features/follows/FollowToggle.tsx': 1,
    'src/features/money/NativeMoneyMap.tsx': 1,
    'src/navigation/SourceDestination.tsx': 1,
  },
  'deprecated-design/bronze': {
    'src/design/labels.tsx': 1,
    'src/design/lead.tsx': 4,
    'src/design/source.tsx': 2,
    'src/features/ask/AnswerView.tsx': 1,
    'src/features/bills/parts.tsx': 1,
    'src/features/leads/Chart.tsx': 1,
    'src/features/leads/LeadFeedCard.tsx': 4,
    'src/features/reports/parts.tsx': 1,
  },
  'category-ink/category': {
    'src/design/labels.tsx': 2,
    'src/features/Electorate.tsx': 1,
    'src/features/directories/PartyDirectoryRow.tsx': 1,
    'src/features/money-public/Agencies.tsx': 1,
    'src/features/money-public/Allocation.tsx': 1,
    'src/features/money-public/Largest.tsx': 1,
    'src/features/money-public/Program.tsx': 1,
    'src/features/records/BillTextReader.tsx': 1,
  },
  'show-menu/menu': {
    'src/features/ask/AnswerView.tsx': 1,
    'src/features/bills/BillDetail.tsx': 1,
    'src/features/people/PageActions.tsx': 1,
    'src/features/records/RecordActions.tsx': 2,
    'src/features/search/Results.tsx': 1,
    'src/features/sources/SourcesScreen.tsx': 1,
    'src/features/today/RecordMenu.tsx': 1,
    'src/navigation/chrome.ts': 2,
  },
};
function withRatchet(rule, ruleName) {
  return {
    ...rule,
    create(context) {
      const reports = [];
      const proxy = Object.create(context);
      Object.defineProperty(proxy, 'report', {
        value: (descriptor) => reports.push(descriptor),
      });
      const listeners = rule.create(proxy);
      const finish = listeners['Program:exit'];
      return {
        ...listeners,
        'Program:exit'(node) {
          if (finish) finish(node);
          const file = context.filename
            .replace(/\\/g, '/')
            .split('/mobile/')
            .pop();
          const counts = {};
          for (const report of reports) {
            const recipe = `${ruleName}/${report.messageId}`;
            counts[recipe] = (counts[recipe] || 0) + 1;
            if (counts[recipe] > (ratchetBaseline[recipe]?.[file] || 0))
              context.report(report);
          }
        },
      };
    },
  };
}
module.exports = withRatchet(deprecatedRule, 'deprecated-design');
module.exports.rules = rules;
module.exports.ratchetBaseline = ratchetBaseline;
