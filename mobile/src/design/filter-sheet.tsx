import { RouteOptions } from '../navigation/preview';
import { router, type NativeStackHeaderItem } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type {
  FilterModel,
  FilterRow,
  FilterToggle,
} from '../features/sheets/filter-model';
import { androidHeaderBar, headerItems } from '../navigation/chrome';
import { filterFacetRoute } from '../navigation/routes/filters';
import { useAccessibilitySize } from './accessibility';
import { Button, PopUpButton, SegmentedPicker, SwitchRow } from './controls';
import { copy } from './copy';
import { haptic } from './haptics';
import { useKeyCommand } from './keyboard';
import { InsetGroup, Screen } from './layout';
import { LinkRow } from './rows';
import { useListSearchBar } from './search-bar';
import { ContentUnavailable, Skeleton } from './states';
import { Text } from './text';
import { colors, minimumTarget, rhythm } from './tokens';
export {
  filterStore,
  registerFilterModel,
  useFilterState,
} from '../features/sheets/filter-model';
export type {
  FilterChoice,
  FilterModel,
  FilterRow,
  FilterToggle,
  FilterToggleGroup,
  FilterValues,
} from '../features/sheets/filter-model';

export function filterBar(onDone: () => void, onCancel?: () => void) {
  const done: NativeStackHeaderItem = {
    type: 'button',
    label: copy.done,
    variant: 'plain',
    tintColor: colors.navy,
    onPress: onDone,
  };
  const cancel: NativeStackHeaderItem = {
    type: 'button',
    label: copy.cancel,
    variant: 'plain',
    tintColor: colors.navy,
    onPress: () => onCancel?.(),
  };
  return {
    ...headerItems(() => [done]),
    ...(onCancel
      ? {
          unstable_headerLeftItems: () => [cancel],
          ...(Platform.OS === 'android'
            ? { headerLeft: () => androidHeaderBar([cancel]) }
            : {}),
        }
      : {}),
  };
}
export function filterRowValue<S extends object>(row: FilterRow<S>, value: S) {
  if (row.disabled) return row.disabledLabel ?? 'Loads with the list';
  if (row.loading) return 'All';
  const selected = row.value(value);
  return (
    row.choices(value).find((choice) => choice.value === selected)?.label ??
    (selected || 'Any')
  );
}
/** Live changes; Cancel restores the opening snapshot supplied by the route. */
export function FilterSheet<S extends object>({
  model,
  value,
  onChange,
  onDone,
  onCancel,
  owner,
  onFacet,
}: {
  model: FilterModel<S>;
  value: S;
  onChange: (next: S) => void;
  onDone: () => void;
  onCancel: () => void;
  owner?: string;
  onFacet?: (facet: string) => void;
}) {
  useKeyCommand('list-escape', onDone);
  const toggleGroups = new Map<string | undefined, FilterToggle<S>[]>();
  for (const toggle of model.toggles ?? []) {
    const group = toggleGroups.get(toggle.group) ?? [];
    group.push(toggle);
    toggleGroups.set(toggle.group, group);
  }
  const groupCount = (model.rows.length ? 1 : 0) + toggleGroups.size;
  return (
    <>
      <RouteOptions
        options={{
          title: model.title ?? (model.list === 'ask' ? 'Options' : 'Filters'),
          headerTitleAlign: 'center',
          ...filterBar(onDone, onCancel),
        }}
      />
      <Screen grouped testID="filters-screen">
        {model.rows.length ? (
          <InsetGroup>
            {model.rows.map((row) => (
              <LinkRow
                key={row.key}
                title={row.title}
                value={filterRowValue(row, value)}
                disabled={row.disabled}
                testID={`filters-row-${row.key}`}
                onPress={() =>
                  onFacet
                    ? onFacet(row.key)
                    : router.push(filterFacetRoute(model.list, row.key, owner))
                }
              />
            ))}
          </InsetGroup>
        ) : null}
        {model.segments ? (
          <SegmentedPicker
            options={model.segments.options}
            value={model.segments.value(value)}
            onChange={(next) => onChange(model.segments!.select(value, next))}
            accessibilityLabel={model.segments.label}
            testID={`filters-${model.segments.key}`}
          />
        ) : null}
        {[...toggleGroups].map(([key, toggles]) => {
          const group = model.toggleGroups?.find((group) => group.key === key);
          return (
            <InsetGroup
              key={key ?? 'toggles'}
              header={groupCount > 1 ? group?.header : undefined}
              footer={group?.footer}
              testID={key && `filters-toggle-group-${key}`}
            >
              {toggles.map((toggle) => (
                <SwitchRow
                  key={toggle.key}
                  label={toggle.label}
                  value={toggle.value(value)}
                  onValueChange={(next) => onChange(toggle.select(value, next))}
                  testID={`filters-row-${toggle.key}`}
                />
              ))}
            </InsetGroup>
          );
        })}
        {model.resultLine ? (
          <Text
            variant="footnote"
            accessibilityLiveRegion="polite"
            testID="filters-result"
          >
            {model.resultLine(value)}
          </Text>
        ) : null}
        {model.footer ? <Text variant="footnote">{model.footer}</Text> : null}
        {!model.isDefault(value) ? (
          <Button
            variant="plain"
            label={copy.resetFilters}
            onPress={() => onChange(model.reset(value))}
            testID="filters-reset"
          />
        ) : null}
      </Screen>
    </>
  );
}
/** The same two menu pickers serve Ask, Search and custom money ranges. */
export function FilterYears<S extends object>({
  model,
  value,
  onChange,
}: {
  model: FilterModel<S>;
  value: S;
  onChange: (next: S) => void;
}) {
  const stacked = useAccessibilitySize();
  const years = model.years;
  if (!years) return null;
  const from = String(value[years.from] ?? ''),
    to = String(value[years.to] ?? '');
  const select = (key: 'from' | 'to', next: string) => {
    const parsed = next && years.numeric ? Number(next) : next;
    // Moving From forward also moves To, so the list never sees an inverted range.
    onChange({
      ...value,
      [years[key]]: parsed,
      ...(key === 'from' && next && to && Number(next) > Number(to)
        ? { [years.to]: parsed }
        : {}),
    });
  };
  return (
    <InsetGroup>
      <View
        testID="filters-years-from-row"
        style={[styles.yearRow, stacked && styles.yearRowStacked]}
      >
        <Text variant="body">From</Text>
        <PopUpButton
          label="From"
          value={from}
          options={[
            ...(years.numeric ? [] : [{ value: '', label: 'Any' }]),
            ...years.options,
          ]}
          onChange={(next) => select('from', next)}
          testID="filters-years-from"
        />
      </View>
      <View
        testID="filters-years-to-row"
        style={[styles.yearRow, stacked && styles.yearRowStacked]}
      >
        <Text variant="body">To</Text>
        <PopUpButton
          label="To"
          value={to}
          options={[
            ...(years.numeric ? [] : [{ value: '', label: 'Any' }]),
            ...years.options.filter(
              (year) => !from || Number(year.value) >= Number(from),
            ),
          ]}
          onChange={(next) => select('to', next)}
          testID="filters-years-to"
        />
      </View>
    </InsetGroup>
  );
}

const styles = StyleSheet.create({
  yearRow: {
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rhythm.tight,
  },
  yearRowStacked: { flexDirection: 'column', alignItems: 'flex-start' },
});
export function FilterFacet<S extends object>({
  model,
  facet,
  value,
  onChange,
  onBack,
  onDone,
}: {
  model: FilterModel<S>;
  facet: string;
  value: S;
  onChange: (next: S) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const row = model.rows.find((item) => item.key === facet);
  const [query, setQuery] = useState('');
  const search = useListSearchBar({
    placeholder: row?.searchPlaceholder ?? '',
    onChangeText: setQuery,
    onSearchButtonPress: setQuery,
    onCancelButtonPress: () => setQuery(''),
  });
  return (
    <>
      <RouteOptions
        options={{
          title: row?.title ?? 'Filters',
          ...filterBar(onDone),
          ...(row?.searchPlaceholder ? { headerSearchBarOptions: search } : {}),
        }}
      />
      <Screen grouped testID="filters-facet-screen">
        {!row ? (
          <ContentUnavailable
            title="Nothing to show"
            symbol="line.3.horizontal.decrease.circle"
          />
        ) : row.loading ? (
          <Skeleton
            shape="rows"
            count={6}
            onSunken
            label={`Loading ${row.title.toLocaleLowerCase('en-AU')}`}
            testID="filters-choices-loading"
          />
        ) : row.kind === 'years' ? (
          <FilterYears model={model} value={value} onChange={onChange} />
        ) : (
          <InsetGroup>
            {row
              .choices(value)
              .filter((choice) =>
                choice.label
                  .toLocaleLowerCase('en-AU')
                  .includes(query.toLocaleLowerCase('en-AU')),
              )
              .map((choice) => (
                <LinkRow
                  key={choice.value}
                  title={choice.label}
                  value={
                    choice.count == null
                      ? undefined
                      : choice.count.toLocaleString('en-AU')
                  }
                  selected={
                    row.multiple
                      ? choice.value
                        ? row.value(value).split(',').includes(choice.value)
                        : !row.value(value)
                      : row.value(value) === choice.value
                  }
                  accessory="checkmark"
                  accessibilityLabel={
                    choice.count === 0
                      ? `${choice.label}, no results with your other filters`
                      : choice.label
                  }
                  testID={`filters-choice-${choice.value || 'all'}`}
                  onPress={() => {
                    onChange(row.select(value, choice.value));
                    haptic('selection');
                    if (!row.multiple) onBack();
                  }}
                />
              ))}
          </InsetGroup>
        )}
      </Screen>
    </>
  );
}
