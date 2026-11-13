import {
  Host,
  RNHostView,
  Button as SwiftButton,
  ContextMenu as SwiftContextMenu,
  Menu as SwiftMenu,
  Section as SwiftSection,
} from '@expo/ui/swift-ui';
import { cloneElement, type ReactElement } from 'react';
import {
  Platform,
  Pressable as NativePressable,
  type PressableProps,
} from 'react-native';
import { Pressable } from './pressable';
import { androidControls } from './tokens';
import { showMenu } from './menu';
import { menuTitle } from './menu-title';
import { menuLeaves, menuSections, type RowMenuAction } from './row-link';

/** A menu on content that has no navigation destination. */
export function ContextMenu({
  items,
  children,
}: {
  items: RowMenuAction[];
  children: ReactElement<PressableProps>;
}) {
  const sections = menuSections(items);
  const leaves = menuLeaves(sections);
  const trigger = cloneElement(children, {
    accessibilityActions: [
      ...(children.props.accessibilityActions ?? []),
      ...leaves.map(({ title }) => ({ name: title, label: title })),
    ],
    onAccessibilityAction: (event) => {
      const item = leaves.find(
        (item) => item.title === event.nativeEvent.actionName,
      );
      if (item) item.onPress();
      else children.props.onAccessibilityAction?.(event);
    },
    ...(Platform.OS === 'android'
      ? {
          android_ripple: children.props.android_ripple ?? {
            color: androidControls.ripple,
            foreground: true,
          },
          onLongPress: (event: import('react-native').GestureResponderEvent) =>
            showMenu('', leaves, {
              x: event.nativeEvent.pageX,
              y: event.nativeEvent.pageY,
              width: 0,
              height: 0,
            }),
        }
      : Platform.OS !== 'ios'
        ? { onLongPress: () => showMenu('', leaves) }
        : {}),
  });
  if (Platform.OS === 'android' && children.type === NativePressable)
    return <Pressable {...trigger.props} />;
  if (Platform.OS !== 'ios') return trigger;
  return (
    <Host matchContents={{ vertical: true }}>
      <SwiftContextMenu>
        <SwiftContextMenu.Trigger>
          <RNHostView matchContents>{trigger}</RNHostView>
        </SwiftContextMenu.Trigger>
        <SwiftContextMenu.Items>{nativeItems(sections)}</SwiftContextMenu.Items>
      </SwiftContextMenu>
    </Host>
  );
}

function nativeItems(items: readonly RowMenuAction[]): ReactElement[] {
  return items.map((item, index) =>
    'items' in item ? (
      item.inline ? (
        <SwiftSection key={index} title={menuTitle(item.title) || undefined}>
          {nativeItems(item.items)}
        </SwiftSection>
      ) : (
        <SwiftMenu
          key={index}
          label={menuTitle(item.title)}
          systemImage={item.symbol}
        >
          {nativeItems(item.items)}
        </SwiftMenu>
      )
    ) : (
      <SwiftButton
        key={index}
        label={menuTitle(item.title)}
        systemImage={item.symbol}
        role={item.destructive ? 'destructive' : undefined}
        onPress={item.onPress}
      />
    ),
  );
}
