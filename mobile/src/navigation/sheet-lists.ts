import type { NativeStackNavigationOptions } from 'expo-router';
import { closeSheetItem, headerItems } from './chrome';

/** Lists may also be opened as the first route of a presented stack. */
export const sheetListRoutes = new Set([
  'recent-records',
  'record-list',
  'directory',
  'declarations',
  'person/[slug]/votes',
  'person/[slug]/speeches',
  'person/[slug]/interests',
  'party-sources',
  'members',
  'bill-list',
  'agency-list',
  'money-donors',
  'division-history',
  'grants',
  'largest-grants',
  'agencies',
  'connections',
  'grants-allocation',
  'funding-by-seat-type',
  'leads',
  'discover',
  'topics',
  'follows',
  'conversations',
]);

/** Keep Done when a list installs its loaded Share, Filters or More items. */
export function sheetListOptions(
  options: NativeStackNavigationOptions,
  name: string | undefined,
  index: number | undefined,
): NativeStackNavigationOptions {
  if (index !== 0 || !name || !sheetListRoutes.has(name)) return options;
  const items = options.unstable_headerRightItems;
  return {
    ...options,
    headerTitleAlign: 'center',
    ...(items
      ? headerItems(() => {
          const rows = items({ canGoBack: false });
          return rows.some((item) => 'label' in item && item.label === 'Done')
            ? rows
            : [...rows, closeSheetItem()];
        })
      : {}),
  };
}
