import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import { InteractionManager } from 'react-native';
import { OpaxIPad, type KeyCommandSpec } from '../../modules/opax-ipad';

export type { KeyCommandSpec };

/**
 * Hardware-keyboard commands on iPad (Oct 2026). The native module
 * (`modules/opax-ipad`) registers each command with UIKit, which lists them
 * in the Cmd-hold shortcut overlay, and reports a press by `id`. Handlers
 * live here: the most recently registered handler for an id runs, so a
 * focused split list takes the arrows while it is on screen and gives them
 * back when it leaves. Nothing is installed on iPhone or Android.
 */
export type KeyCommandId =
  | 'find'
  | 'new-question'
  | 'section-1'
  | 'section-2'
  | 'section-3'
  | 'section-4'
  | 'section-5'
  | 'list-up'
  | 'list-down'
  | 'back'
  | 'refresh'
  | 'list-open'
  | 'list-escape';

export const keyCommandSpecs: readonly (KeyCommandSpec & {
  id: KeyCommandId;
})[] = [
  { id: 'find', input: 'f', modifiers: ['command'], title: 'Search' },
  {
    id: 'new-question',
    input: 'n',
    modifiers: ['command'],
    title: 'New question',
  },
  { id: 'section-1', input: '1', modifiers: ['command'], title: 'Today' },
  { id: 'section-2', input: '2', modifiers: ['command'], title: 'Your MP' },
  { id: 'section-3', input: '3', modifiers: ['command'], title: 'Bills' },
  { id: 'section-4', input: '4', modifiers: ['command'], title: 'Search' },
  { id: 'section-5', input: '5', modifiers: ['command'], title: 'Ask' },
  { id: 'back', input: '[', modifiers: ['command'], title: 'Back' },
  { id: 'refresh', input: 'r', modifiers: ['command'], title: 'Refresh' },
  {
    id: 'list-open',
    input: 'return',
    modifiers: [],
    title: 'Open focused row',
  },
  // Arrows retain native text-field behavior and stay out of the overlay.
  { id: 'list-up', input: 'up', modifiers: [], title: '' },
  { id: 'list-down', input: 'down', modifiers: [], title: '' },
  { id: 'list-escape', input: 'escape', modifiers: [], title: 'Close sheet' },
];

type Handler = () => void;
const handlers = new Map<string, Handler[]>();

/** Registers a handler; returns the function that removes it. */
export function onKeyCommand(id: KeyCommandId, handler: Handler) {
  const list = handlers.get(id) ?? [];
  list.push(handler);
  handlers.set(id, list);
  return () => {
    const current = handlers.get(id) ?? [];
    const index = current.lastIndexOf(handler);
    if (index >= 0) current.splice(index, 1);
  };
}

/** Runs the newest handler for `id`; false when none is registered. */
export function dispatchKeyCommand(id: string): boolean {
  // A modal surface owns the keyboard: nothing behind it hears a key.
  const scope = scopes.at(-1);
  if (scope) return scope.run(id);
  const handler = handlers.get(id)?.at(-1);
  if (!handler) return false;
  handler();
  return true;
}

/** A command that belongs to one modal surface, with its handler. */
export type ScopedKeyCommand = KeyCommandSpec & { run: Handler };
interface KeyScope {
  specs: KeyCommandSpec[];
  run: (id: string) => boolean;
}
const scopes: KeyScope[] = [];
let installed = false;

/** UIKit's command list: the open modal surface's, else the app's. */
function applyKeyCommands() {
  if (!OpaxIPad || !installed) return;
  const scope = scopes.at(-1);
  void OpaxIPad.setKeyCommands(
    (scope?.specs ?? keyCommandSpecs).map((spec) => ({ ...spec })),
  );
}

/**
 * Key commands for a modal surface that covers the app (the welcome tour)
 * while it is mounted and `enabled`. While it is open UIKit lists only its
 * commands in the Cmd-hold overlay, and presses go only to its handlers, so
 * Cmd-1 or Escape never act on the screen behind it. Titles may change
 * between renders (the Return key's "Next" becomes "Choose your electorate");
 * the list is installed again when they do.
 */
export function useKeyScope(
  commands: readonly ScopedKeyCommand[],
  enabled = true,
) {
  const latest = useRef(commands);
  useEffect(() => {
    latest.current = commands;
  });
  const signature = JSON.stringify(
    commands.map(({ run: _run, ...spec }) => spec),
  );
  useEffect(() => {
    if (!enabled) return;
    const scope: KeyScope = {
      specs: JSON.parse(signature) as KeyCommandSpec[],
      run: (id) => {
        const command = latest.current.find((item) => item.id === id);
        if (!command) return false;
        command.run();
        return true;
      },
    };
    scopes.push(scope);
    applyKeyCommands();
    return () => {
      const index = scopes.lastIndexOf(scope);
      if (index >= 0) scopes.splice(index, 1);
      applyKeyCommands();
    };
  }, [signature, enabled]);
}

/**
 * A key command handler while the component is mounted and `enabled`. The
 * handler may change between renders; the newest one runs.
 */
export function useKeyCommand(
  id: KeyCommandId,
  handler: Handler,
  enabled = true,
) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    return onKeyCommand(id, () => latest.current());
  }, [id, enabled]);
}

/** Refresh belongs to the visible route, including lists retained in a stack. */
export function useRefreshCommand(refresh?: () => void, busy = false) {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!navigation) return () => {};
      const focus = navigation.addListener('focus', listener);
      const blur = navigation.addListener('blur', listener);
      return () => {
        focus();
        blur();
      };
    },
    [navigation],
  );
  const focused = useSyncExternalStore(
    subscribe,
    () => navigation?.isFocused() ?? true,
  );
  useKeyCommand('refresh', () => refresh?.(), focused && !!refresh && !busy);
}

/** Installs the commands with UIKit once (iPad only); returns false elsewhere. */
export function installKeyCommands(): boolean {
  if (!OpaxIPad || installed) return installed;
  installed = true;
  OpaxIPad.addListener('onKeyCommand', ({ id }) => {
    dispatchKeyCommand(id);
  });
  applyKeyCommands();
  return true;
}

// Focus requests: Cmd-F and Cmd-N move to a screen that may not be mounted
// yet, so a request waits until that screen's field takes it.
export type FocusTarget = 'search' | 'ask';
const pending = new Set<FocusTarget>();
const focusListeners = new Map<FocusTarget, Set<() => void>>();

export function requestFocus(target: FocusTarget) {
  pending.add(target);
  focusListeners.get(target)?.forEach((listener) => listener());
}

/** Takes a pending request for `target`, if there is one. */
export function takeFocusRequest(target: FocusTarget): boolean {
  return pending.delete(target);
}

/**
 * Focuses `ref` when a request for `target` arrives, including one made
 * before this screen mounted, once the navigation transition has settled.
 */
export function useFocusRequest(
  target: FocusTarget,
  ref: RefObject<{ focus(): void } | null>,
) {
  useEffect(() => {
    const focus = () => {
      if (!takeFocusRequest(target)) return;
      void InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => ref.current?.focus());
      });
    };
    const listeners = focusListeners.get(target) ?? new Set();
    listeners.add(focus);
    focusListeners.set(target, listeners);
    focus();
    return () => {
      listeners.delete(focus);
    };
  }, [target, ref]);
}
