import {
  Button,
  LoadingState,
  RowList,
  Screen,
  Section,
} from '../../design/primitives';
import {
  billFilterStore,
  billSorts,
  chamberLabel,
  parliamentLabel,
  useBillFilterState,
  type BillFilters as Filters,
} from './filters';
import { OptionRow } from './parts';
import { ToggleRow } from '../directories/ToggleRow';

/**
 * The bill list's filters, as a sheet: status, the chamber a bill was
 * introduced in, and year. Each choice applies at once and shows how many
 * bills in the whole index carry it. Done closes the sheet.
 */
export default function BillFilters() {
  const { filters, facets } = useBillFilterState();
  const set = (next: Filters) => billFilterStore.setFilters(next);
  if (!facets)
    return (
      <Screen testID="bill-filters-screen">
        <LoadingState shape="rows" count={4} label="Loading filters" />
      </Screen>
    );
  const any =
    filters.status ||
    filters.chamber ||
    filters.year !== undefined ||
    filters.parliament !== undefined ||
    filters.divided ||
    filters.sort;
  return (
    <Screen testID="bill-filters-screen">
      <Section title="Parliament" accent="bills" rule={false}>
        <RowList>
          <OptionRow
            label="All parliaments"
            count={facets.total}
            selected={filters.parliament === undefined}
            onPress={() => set({ ...filters, parliament: undefined })}
            testID="bill-filter-parliament-all"
          />
          {facets.parliaments.map((p) => (
            <OptionRow
              key={p.value}
              label={parliamentLabel(p.value)}
              count={p.count}
              selected={filters.parliament === p.value}
              onPress={() => set({ ...filters, parliament: p.value })}
              testID={`bill-filter-parliament-${p.value}`}
            />
          ))}
        </RowList>
      </Section>
      <Section title="Division records" accent="votes">
        <ToggleRow
          label="Divided on"
          checked={!!filters.divided}
          testID="bill-filter-divided"
          onChange={() => set({ ...filters, divided: !filters.divided })}
        />
      </Section>
      <Section title="Sort" accent="bills">
        <RowList>
          {billSorts.map((s) => (
            <OptionRow
              key={s.value}
              label={s.label}
              count={facets.total}
              selected={(filters.sort ?? 'newest') === s.value}
              onPress={() => set({ ...filters, sort: s.value })}
              testID={`bill-filter-sort-${s.value}`}
            />
          ))}
        </RowList>
      </Section>
      <Section title="Status">
        <RowList>
          <OptionRow
            label="All bills"
            count={facets.total}
            selected={!filters.status}
            onPress={() => set({ ...filters, status: undefined })}
            testID="bill-filter-status-all"
          />
          {facets.statuses.map((status) => (
            <OptionRow
              key={status.value}
              label={status.label}
              count={status.count}
              selected={filters.status === status.value}
              onPress={() => set({ ...filters, status: status.value })}
              testID={`bill-filter-status-${status.value}`}
            />
          ))}
        </RowList>
      </Section>
      <Section title="Chamber introduced in">
        <RowList>
          <OptionRow
            label="All bills"
            count={facets.total}
            selected={!filters.chamber}
            onPress={() => set({ ...filters, chamber: undefined })}
            testID="bill-filter-chamber-all"
          />
          {facets.chambers.map((chamber) => (
            <OptionRow
              key={chamber.value}
              label={chamberLabel(chamber.value)}
              count={chamber.count}
              selected={filters.chamber === chamber.value}
              onPress={() => set({ ...filters, chamber: chamber.value })}
              testID={`bill-filter-chamber-${chamber.value}`}
            />
          ))}
        </RowList>
      </Section>
      <Section title="Year">
        <RowList>
          <OptionRow
            label="All bills"
            count={facets.total}
            selected={filters.year === undefined}
            onPress={() => set({ ...filters, year: undefined })}
            testID="bill-filter-year-all"
          />
          {facets.years.map((year) => (
            <OptionRow
              key={year.value}
              label={String(year.value)}
              count={year.count}
              selected={filters.year === year.value}
              onPress={() => set({ ...filters, year: year.value })}
              testID={`bill-filter-year-${year.value}`}
            />
          ))}
        </RowList>
      </Section>
      {any ? (
        <Button
          label="Clear filters"
          onPress={() => set({})}
          testID="bill-filters-clear"
        />
      ) : null}
    </Screen>
  );
}
