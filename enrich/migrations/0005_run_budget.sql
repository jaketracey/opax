-- Budget admission and in-flight reservations survive ticks, restarts and UTC days.
CREATE TABLE enrichment_runs (
  run_id TEXT PRIMARY KEY, cap_neurons INTEGER NOT NULL CHECK(cap_neurons>=0),
  spent_neurons INTEGER NOT NULL DEFAULT 0, reserved_neurons INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE enrichment_units (
  rid TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES enrichment_runs(run_id),
  initial_neurons INTEGER NOT NULL, credit_neurons INTEGER NOT NULL DEFAULT 0,
  admitted INTEGER NOT NULL DEFAULT 0, work TEXT NOT NULL
);
CREATE INDEX enrichment_units_waiting ON enrichment_units(admitted,run_id);
CREATE TABLE enrichment_calls (
  token TEXT PRIMARY KEY, run_id TEXT NOT NULL, rid TEXT NOT NULL, day TEXT NOT NULL,
  upper_neurons INTEGER NOT NULL, credit_neurons INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'reserved', actual_neurons REAL
);
CREATE INDEX enrichment_calls_day ON enrichment_calls(day,state);
