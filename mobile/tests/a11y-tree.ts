import type { ReactTestInstance } from 'react-test-renderer';

/**
 * What VoiceOver and TalkBack reach on a rendered screen, in tree order: each
 * element a screen reader stops on, with what it says. A host view marked
 * `accessible` is one element (its label, or its texts joined); a host Text
 * not marked `accessible={false}` is one element; a subtree hidden with
 * `accessibilityElementsHidden` or `importantForAccessibility=
 * "no-hide-descendants"` is skipped. Tree order is TalkBack's order, and
 * VoiceOver's for elements stacked down one column.
 */
export interface A11yElement {
  label: string;
  role?: string;
  hint?: string;
  state?: Record<string, unknown>;
  testID?: string;
  node: ReactTestInstance;
}

const isHost = (node: ReactTestInstance) => typeof node.type === 'string';
const hidden = (node: ReactTestInstance) =>
  node.props.accessibilityElementsHidden === true ||
  node.props.importantForAccessibility === 'no-hide-descendants' ||
  node.props['aria-hidden'] === true;
const isText = (node: ReactTestInstance) =>
  (node.type as unknown) === 'Text' || (node.type as unknown) === 'RCTText';

const children = (node: ReactTestInstance) =>
  node.children as (ReactTestInstance | string)[];

/** The words under a node a screen reader would join for a group. */
function spokenText(node: ReactTestInstance): string[] {
  if (isHost(node) && hidden(node)) return [];
  if (isHost(node) && isText(node)) {
    if (node.props.accessibilityLabel) return [node.props.accessibilityLabel];
    const words = flatText(node).trim();
    return words ? [words] : [];
  }
  return children(node).flatMap((child) =>
    typeof child === 'string' ? [] : spokenText(child),
  );
}
function flatText(node: ReactTestInstance): string {
  return children(node)
    .map((child) => (typeof child === 'string' ? child : flatText(child)))
    .join('');
}

export function accessibilityElements(root: ReactTestInstance): A11yElement[] {
  const out: A11yElement[] = [];
  const visit = (node: ReactTestInstance) => {
    if (isHost(node)) {
      if (hidden(node)) return;
      const accessible =
        node.props.accessible === true ||
        (isText(node) && node.props.accessible !== false);
      if (accessible) {
        const label = String(
          node.props.accessibilityLabel ??
            node.props['aria-label'] ??
            spokenText(node).join(', '),
        )
          .replace(/ /g, ' ')
          .trim();
        // The host node is kept out of enumeration, so a failing assertion
        // prints the element, not the whole (circular) tree.
        out.push(
          Object.defineProperty(
            {
              label,
              role: node.props.accessibilityRole ?? node.props.role,
              hint: node.props.accessibilityHint,
              state: node.props.accessibilityState,
              testID: node.props.testID,
            },
            'node',
            { value: node, enumerable: false },
          ) as A11yElement,
        );
        return;
      }
    }
    for (const child of children(node))
      if (typeof child !== 'string') visit(child);
  };
  visit(root);
  return out;
}

/** The elements as VoiceOver reads them, one line each: "label (role)". */
export function readAloud(root: ReactTestInstance): string[] {
  return accessibilityElements(root).map(
    (element) => `${element.label}${element.role ? ` (${element.role})` : ''}`,
  );
}
