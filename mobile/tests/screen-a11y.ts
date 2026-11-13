import { Children, isValidElement } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { Pressable as NativePressable, StyleSheet } from 'react-native';
import { spokenFigures } from '../src/design/format';

export type AuditRule =
  | 'touchable-role'
  | 'touchable-label'
  | 'image-label'
  | 'heading'
  | 'screen-title'
  | 'state'
  | 'spoken-figures'
  | 'grouping'
  | 'live-region'
  | 'target-size';
export type AuditFinding = {
  rule: AuditRule;
  element: string;
  detail: string;
  ancestry?: string[];
};
type Options = {
  platform: 'ios' | 'android';
  nativeTitle?: string;
  announcements?: readonly string[];
  nativeMenus?: readonly unknown[];
  nativeButtons?: readonly unknown[];
  link?: unknown;
  linkTrigger?: unknown;
};
const host = (node: ReactTestInstance) => typeof node.type === 'string';
const hidden = (node: ReactTestInstance) =>
  node.props.accessibilityElementsHidden ||
  node.props.importantForAccessibility === 'no-hide-descendants' ||
  node.props['aria-hidden'];
const text = (node: ReactTestInstance) =>
  /^(RCT)?Text$/.test(String(node.type));
const role = (node: ReactTestInstance) =>
  node.props.role ?? node.props.accessibilityRole;
const children = (node: ReactTestInstance) =>
  node.children.filter((c): c is ReactTestInstance => typeof c !== 'string');
function words(node: ReactTestInstance): string {
  if (host(node) && hidden(node)) return '';
  if (node.props.accessibilityLabel) return node.props.accessibilityLabel;
  return node.children
    .map((c) => (typeof c === 'string' ? c : words(c)))
    .filter(Boolean)
    .join(text(node) ? '' : ' ');
}
function touchable(node: ReactTestInstance): boolean {
  if (
    node.props.onPress ||
    node.props.onLongPress ||
    node.props.onAccessibilityTap
  )
    return true;
  // RN installs pressability handlers even on an inert Pressable. The
  // caller's activation callback, not those handlers, determines interactivity.
  if (!node.props.onClick) return false;
  const nativeType = (NativePressable as unknown as { type?: unknown }).type;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === NativePressable || parent.type === nativeType)
      return !!(parent.props.onPress || parent.props.onLongPress);
  }
  return true;
}
const titleVariants = new Set([
  'largeTitle',
  'pageTitle',
  'recordTitle',
  'recordHeading',
]);
// groupHeader also styles metadata and field labels, so typography alone
// cannot determine that it is a section heading.
const headingVariants = new Set([
  ...titleVariants,
  'sectionTitle',
  'subsectionTitle',
]);

/** Checks only facts present in the render. It never assumes text or flex has
 * a measured size, that a mock native view has real traits, or that a recorded
 * prop proves the behaviour of a screen reader. */
export function auditAccessibility(
  root: ReactTestInstance,
  options: Options,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  let titleCount = 0;
  let hasHeader = false;
  let nativeTitle = options.nativeTitle;
  const add = (rule: AuditRule, node: ReactTestInstance, detail: string) => {
    const ancestry = [];
    for (
      let parent: ReactTestInstance | null = node;
      parent && ancestry.length < 12;
      parent = parent.parent
    )
      ancestry.push(
        typeof parent.type === 'string'
          ? parent.type
          : typeof parent.type === 'function'
            ? parent.type.name
            : 'Component',
      );
    findings.push({
      rule,
      element:
        node.props.testID ??
        (words(node).slice(0, 110) ||
          (typeof node.type === 'function'
            ? node.type.name
            : String(node.type))),
      detail,
      ancestry,
    });
  };
  let pending = false;
  const visit = (node: ReactTestInstance, grouped = false, live = false) => {
    if (options.nativeMenus?.includes(node.type)) return;
    if (options.nativeButtons?.includes(node.type)) {
      if (!(node.props.label ?? words(node)).trim())
        add('touchable-label', node, 'Native button needs a label');
      return; // SwiftUI supplies the native button role, not an RN prop.
    }
    // Legacy screen mocks wrap Link/Trigger in a second native Pressable.
    // Audit the slotted child, whose own props form the real touch surface.
    if (node.type === options.link && node.props.asChild) {
      const trigger =
        node.findAll((n) => n.type === options.linkTrigger)[0] ?? node;
      const child = Children.toArray(trigger.props.children).find(
        isValidElement,
      );
      const target =
        child &&
        trigger.findAll((n) => n !== trigger && n.type === child.type)[0];
      if (target) {
        visit(target, grouped, live);
        return;
      }
    }
    if (host(node) && hidden(node)) return;
    if (!host(node)) {
      if (
        headingVariants.has(node.props.variant) &&
        node.props.accessibilityRole !== 'header' &&
        !grouped
      ) {
        // Only the design Text carries this prop through to a host Text.
        const leaf = node.findAll((n) => host(n) && text(n))[0];
        if (leaf && role(leaf) !== 'header')
          add('heading', node, `${node.props.variant} needs the header role`);
      }
      if (titleVariants.has(node.props.variant) && !grouped) titleCount++;
      const name = typeof node.type === 'function' ? node.type.name : '';
      if (
        (name === 'ContentUnavailable' || name === 'SheetFrame') &&
        node.props.title
      )
        nativeTitle = node.props.title;
      if (
        name === 'RecordLoadError' ||
        name === 'Skeleton' ||
        name === 'LoadingState'
      )
        pending = true;
      if (name === 'RouteOptions' || name === 'Screen') {
        const configured = node.props.options?.title ?? node.props.barTitle;
        if (typeof configured === 'string' && configured.trim())
          nativeTitle = configured;
      }
    } else {
      const p = node.props;
      const r = role(node);
      if (r === 'header' && !grouped) hasHeader = true;
      const label = words(node).trim();
      const target =
        touchable(node) ||
        [
          'button',
          'link',
          'switch',
          'checkbox',
          'radio',
          'togglebutton',
          'tab',
          'adjustable',
        ].includes(r);
      const isLive =
        live ||
        ['polite', 'assertive'].includes(p.accessibilityLiveRegion) ||
        r === 'alert';
      if (target && p.accessible !== false) {
        if (!r || r === 'none')
          add('touchable-role', node, 'Touchable needs a role');
        if (!label || /^[^\p{L}\p{N}]+$/u.test(label))
          add('touchable-label', node, 'Touchable needs an action label');
        if (grouped && p.accessible === true)
          add(
            'grouping',
            node,
            'Nested target is swallowed by an accessible group',
          );
        const style =
          StyleSheet.flatten(
            typeof p.style === 'function'
              ? p.style({ pressed: false })
              : p.style,
          ) ?? {};
        const minimum = options.platform === 'ios' ? 44 : 48;
        const slop = p.hitSlop;
        for (const axis of ['width', 'height'] as const) {
          const fixed = style[axis];
          const floor = style[axis === 'width' ? 'minWidth' : 'minHeight'];
          // A minimum is a lower bound, not a measurement: wrapped text can
          // make the real target much taller. Only fixed axes can fail here.
          const size =
            typeof fixed === 'number'
              ? Math.max(fixed, typeof floor === 'number' ? floor : 0)
              : undefined;
          const extra =
            typeof slop === 'number'
              ? slop * 2
              : axis === 'width'
                ? (slop?.left ?? 0) + (slop?.right ?? 0)
                : (slop?.top ?? 0) + (slop?.bottom ?? 0);
          if (size !== undefined && size + extra < minimum)
            add(
              'target-size',
              node,
              `${axis} ${size} + hitSlop ${extra} < ${minimum} on ${options.platform}`,
            );
        }
      }
      if (
        /Image|SymbolView/.test(String(node.type)) &&
        !p.accessibilityLabel &&
        !p.alt &&
        p.accessible !== false
      )
        add('image-label', node, 'Image needs a label or must be decorative');
      if (
        ['switch', 'checkbox', 'radio', 'togglebutton'].includes(r) &&
        typeof p.accessibilityState?.checked !== 'boolean' &&
        p.accessibilityState?.checked !== 'mixed'
      )
        add('state', node, `${r} needs checked state`);
      if (r === 'tab' && typeof p.accessibilityState?.selected !== 'boolean')
        add('state', node, 'Tab needs selected state');
      if (
        target &&
        /^(Expand|Collapse)\b/.test(label) &&
        typeof p.accessibilityState?.expanded !== 'boolean'
      )
        add('state', node, 'Disclosure needs expanded state');
      if (p.disabled && p.accessibilityState?.disabled !== true)
        add('state', node, 'Disabled target needs disabled state');
      if (
        p['aria-expanded'] !== undefined &&
        p.accessibilityState?.expanded !== p['aria-expanded']
      )
        add('state', node, 'Expanded state disagrees');
      if (
        r === 'header' &&
        node.findAll((n) => titleVariants.has(n.props.variant)).length
      )
        titleCount++;
      if (
        (text(node) || p.accessible) &&
        !grouped &&
        label !== spokenFigures(label)
      )
        add('spoken-figures', node, 'Compact money must be spoken in words');
      if (r === 'progressbar' || (p.accessibilityState?.busy && !target)) {
        pending = true;
        if (!isLive && !options.announcements?.includes(label))
          add(
            'live-region',
            node,
            'Loading status needs a live region or announcement',
          );
      }
      live = isLive;
      grouped ||= p.accessible === true;
    }
    for (const child of children(node)) visit(child, grouped, live);
  };
  visit(root);
  // Unnamed detail skeletons intentionally reserve the real title's space.
  if (
    titleCount === 0 &&
    !hasHeader &&
    !nativeTitle &&
    !pending &&
    words(root).trim()
  )
    add(
      'screen-title',
      root,
      'Screen needs an in-content header title or a configured native title',
    );
  return findings.filter(
    (finding, index) =>
      findings.findIndex(
        (other) => JSON.stringify(other) === JSON.stringify(finding),
      ) === index,
  );
}
