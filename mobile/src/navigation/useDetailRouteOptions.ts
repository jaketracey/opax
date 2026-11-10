import type { NativeStackNavigationOptions } from 'expo-router';
import { useLayoutEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { androidHeaderBar, type TestableHeaderItem } from './chrome';

type Options = NativeStackNavigationOptions;
const itemKeys = [
  'unstable_headerRightItems',
  'unstable_headerLeftItems',
  'headerRight',
  'headerLeft',
] as const;

/** Keep native item objects and handlers stable, while actions read current data. */
function itemSource(preserveRef = false) {
  let current: { value: unknown } | undefined;
  let signature: string | undefined;
  let snapshot: unknown;
  const at = (source: { value: unknown }, path: (string | number)[]) =>
    path.reduce<unknown>(
      (value, key) => (value as Record<string | number, unknown>)[key],
      source.value,
    );
  const copy = (
    value: unknown,
    source: { value: unknown },
    path: (string | number)[] = [],
  ): unknown => {
    if (preserveRef && path.at(-1) === 'ref') return value;
    if (typeof value === 'function')
      return (...args: unknown[]) =>
        (at(source, path) as (...args: unknown[]) => unknown)(...args);
    if (Array.isArray(value))
      return value.map((child, key) => copy(child, source, [...path, key]));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          copy(child, source, [...path, key]),
        ]),
      );
    return value;
  };
  return {
    read: () => snapshot,
    update(value: unknown) {
      const next = JSON.stringify(value, (key, child) =>
        preserveRef && key === 'ref'
          ? '[ref]'
          : typeof child === 'function'
            ? '[action]'
            : child,
      );
      if (current && signature === next) {
        current.value = value;
        return false;
      }
      signature = next;
      current = { value };
      snapshot = copy(value, current);
      return true;
    },
  };
}

/**
 * Install a detail's bar items once. Loading, refresh and focus renders update
 * their data through stable callbacks; only changed scalar options are sent to
 * the navigator. A title update also asks native-stack to read changed items,
 * without replacing its bar-item options and replaying the back pill's entry.
 * Title presentation (including scroll-edge fades) has its own owner.
 */
export function useDetailRouteOptions(
  setOptions: (options: Options) => void,
  options?: Options,
) {
  const state = useRef<{
    setter: typeof setOptions;
    applied: Options;
    latest: Options;
    callbacks: Partial<Options>;
    right: ReturnType<typeof itemSource>;
    left: ReturnType<typeof itemSource>;
    search: ReturnType<typeof itemSource>;
  }>(undefined);
  useLayoutEffect(() => {
    if (!options) return;
    if (!state.current || state.current.setter !== setOptions) {
      state.current = {
        setter: setOptions,
        applied: {},
        latest: options,
        callbacks: {},
        right: itemSource(),
        left: itemSource(),
        search: itemSource(true),
      };
    }
    const current = state.current;
    current.latest = options;
    const rightChanged = current.right.update(
      options.unstable_headerRightItems?.({}) ?? [],
    );
    const leftChanged = current.left.update(
      options.unstable_headerLeftItems?.({}) ?? [],
    );
    const delta: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(options)) {
      if (key === 'headerSearchBarOptions') {
        if (current.search.update(value)) delta[key] = current.search.read();
      } else if (itemKeys.includes(key as (typeof itemKeys)[number])) {
        if (!(key in current.callbacks)) {
          const callback =
            key === 'unstable_headerRightItems'
              ? current.right.read
              : key === 'unstable_headerLeftItems'
                ? current.left.read
                : (...args: unknown[]) => {
                    if (
                      Platform.OS === 'android' &&
                      key === 'headerRight' &&
                      'unstable_headerRightItems' in current.latest
                    )
                      return androidHeaderBar(
                        current.right.read() as TestableHeaderItem[],
                      );
                    const render = current.latest[key as keyof Options];
                    return typeof render === 'function'
                      ? (render as (...args: unknown[]) => unknown)(...args)
                      : null;
                  };
          Object.assign(current.callbacks, { [key]: callback });
          delta[key] = callback;
        }
      } else if (!Object.is(current.applied[key as keyof Options], value)) {
        delta[key] = value;
      }
    }
    // Even a seeded title can stay the same while disabled actions become ready.
    if (rightChanged || leftChanged) delta.title = options.title ?? '';
    if (Object.keys(delta).length) setOptions(delta as Options);
    current.applied = options;
  }, [options, setOptions]);
}
