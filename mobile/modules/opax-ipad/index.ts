import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

export interface KeyCommandSpec {
  id: string;
  /** One character, or "up", "down", "escape", "return". */
  input: string;
  modifiers: ('command' | 'shift' | 'option' | 'control')[];
  /** Shown in the Cmd-hold shortcut list. */
  title: string;
}

interface OpaxIPadModule {
  setKeyCommands(commands: KeyCommandSpec[]): Promise<void>;
  /** E2E builds only: runs a command as a key press would. */
  runKeyCommand(id: string): Promise<void>;
  /** E2E builds only: asks the window for a narrow maximum width (0 clears). */
  constrainWindowWidth(width: number): Promise<boolean>;
  addListener(
    event: 'onKeyCommand',
    listener: (event: { id: string }) => void,
  ): { remove(): void };
}

export interface PointerHoverProps extends ViewProps {
  effect?: 'highlight' | 'lift' | 'hover' | 'none';
  /** The pointer platter's corner radius; the child's bounds otherwise. */
  cornerRadius?: number;
  onHoverChange?: (event: { nativeEvent: { hovered: boolean } }) => void;
}

// iPad only. Null on iPhone, Android and in unit tests, where nothing renders
// the native view and no key command is installed.
export const OpaxIPad =
  Platform.OS === 'ios' && Platform.isPad
    ? requireOptionalNativeModule<OpaxIPadModule>('OpaxIPad')
    : null;

export const PointerHoverView: ComponentType<PointerHoverProps> | null =
  OpaxIPad ? requireNativeView<PointerHoverProps>('OpaxIPad') : null;
