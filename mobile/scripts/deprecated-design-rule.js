// opax/deprecated-design: blocks the design recipes that pass 2B retired
// (docs/design/DESIGN-REVIEW-2026-10.md 5.3) from coming back in new code.
// Retired recipes have zero callers and cannot return.

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
// Retired components have zero uses, including inside the kit.
const COMPONENTS = {
  AsAtLine: 'SourceLine',
  SourceLink: 'SourceLine originals',
  OpaxWebLink: 'LinkRow external',
  Figure: 'FigureBlock',
  MoneyFigure: 'FigureBlock',
  BigFigure: 'FigureBlock',
  ViewOriginal: 'SourceLine originals',
  EdgeFade: 'native scroll edges',
  StaleNotice: 'SourceLine savedAt',
  StatRow: 'StatStrip',
  RowList: 'InsetGroup',
  KeyValueList: 'ValueRow in InsetGroup',
  SubSection: 'Section',
  SheetBody: 'SheetFrame',
  RecordStatus: 'recordSourceState',
  MachineLabel: 'MachinePill',
  StatusLabel: 'StatusCapsule',
  BillStatus: 'StatusCapsule',
  RoundButton: 'IconButton (size="large")',
  PartyChip: 'PartyLabel (dense, linked={false})',
  MachineWritten: 'MachinePill',
  SplitEmpty: 'EmptyState size="pane"',
  TodayCard: 'Card',
  ToggleRow: 'SwitchRow',
  MoneyToggle: 'SwitchRow',
  InlineLink: 'LinkRow',
  Chip: 'StatusCapsule, Tag, PartyLabel or SegmentedPicker',
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
    // Only low-level kit styling is exempt from screen-specific recipes.
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
  meta: { type: 'problem', schema: [], messages },
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
          if (
            !inDesign &&
            names.has(node.callee.name) &&
            !context.sourceCode
              .getAncestors(node)
              .some(
                (parent) =>
                  (parent.type === 'IfStatement' ||
                    parent.type === 'ConditionalExpression') &&
                  /Platform\.OS\s*(?:!==?\s*['\"]ios|===?\s*['\"]android)/.test(
                    context.sourceCode.getText(parent.test),
                  ),
              )
          )
            context.report({ node, messageId: 'menu' });
        },
      };
    },
  ),
};

// All deprecated design recipes have a zero baseline and error severity.
const ratchetBaseline = {};
module.exports = deprecatedRule;
module.exports.rules = rules;
module.exports.ratchetBaseline = ratchetBaseline;
