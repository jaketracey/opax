# scripts/vm/data_groups.sh -- which committed files belong to which validate_data.py group.
#
# Sourced by scripts/vm/nightly.sh (and its test). One place says, for each group of files the nightly may
# commit, the repo-relative paths it owns; the nightly validates a group with `validate_data.py <group>` when
# `git status` shows any of its paths changed, and reverts exactly those paths when the check (or a test) fails.
# Paths must exist in HEAD (a new one needs a first manual commit); DIRS marks the ones that are directories
# whose untracked files (a person or shard that no longer exists upstream) must be cleaned on a revert.
# shellcheck shell=bash

# order = the order they are validated in
DATA_GROUPS=(bills votes corpus wrangler money grants suppliers access expenses interests fits speakers people pay discovery taxcharity)

declare -A GROUP_PATHS=(
  [bills]="portal/public/bills"
  [votes]="portal/public/votes.json"
  [corpus]="portal/public/corpus.json"
  [wrangler]="portal/wrangler.jsonc"
  [money]="portal/public/graph/money.json portal/public/graph/money.qld.json portal/public/graph/money.vic.json portal/public/graph/money.tas.json"
  [grants]="portal/public/graph/grants.federal.json portal/public/grants/federal"
  [suppliers]="portal/public/suppliers.json portal/public/suppliers portal/public/agencies.json portal/public/agencies"
  [access]="portal/public/access.json"
  [expenses]="portal/public/expenses.json"
  [interests]="portal/public/interests"
  [fits]="portal/public/fits.json"
  [speakers]="portal/public/speakers.json"
  [people]="portal/public/parliamentarians.json"
  [pay]="portal/public/pay.json"
  [discovery]="portal/public/discovery.json"
  [taxcharity]="portal/public/entities/tax-charity"
)

# every path of every group, in one list
all_data_paths() {
  local g
  for g in "${DATA_GROUPS[@]}"; do echo ${GROUP_PATHS[$g]}; done | tr ' ' '\n'
}
