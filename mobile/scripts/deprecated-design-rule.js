// opax/deprecated-design: blocks the design recipes that pass 2B retired
// (docs/design/DESIGN-REVIEW-2026-10.md 5.3) from coming back in new code.
// The adapters still in use are counted by tests/deprecated-recipes.test.ts,
// which only lets their uses go down.

const ROLES = {
  lede: 'body',
  padLede: 'body',
  caption: 'fine',
  figure: 'display',
  figureInline: 'strong with tabular',
  tag: 'label in bronzeInk, or Tag',
  kicker: 'label, or no kicker at all',
  chip: 'label, or one of the five label kinds',
  countdown: 'control with tabular',
};
// Retired components: zero uses outside src/design, which keeps any alias.
// Aliases still in use (UpdatedCaption, BillStatus, VoteSide, RoundButton,
// AsAtLine, SourceLink, ...) are counted by the ratchet test instead.
const COMPONENTS = {
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

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      role: 'Type role "{{name}}" is deprecated: use {{use}}.',
      places: 'The "places" accent is deprecated: use "people".',
      component: '{{name}} is retired: use {{use}}.',
      uppercase:
        'No uppercase or letter-spaced labels (D6): write labels in sentence case.',
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
