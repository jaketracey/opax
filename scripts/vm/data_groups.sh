# scripts/vm/data_groups.sh -- which committed files belong to which validate_data.py group.
#
# Sourced by scripts/vm/nightly.sh (and its test). One place says, for each group of files the nightly may
# commit, the repo-relative paths it owns; the nightly validates a group with `validate_data.py <group>` when
# `git status` shows any of its paths changed, and reverts exactly those paths when the check (or a test) fails.
# Paths must exist in HEAD (a new one needs a first manual commit); DIRS marks the ones that are directories
# whose untracked files (a person or shard that no longer exists upstream) must be cleaned on a revert.
#
# Every tracked file a night writes belongs to exactly one group: the exports' own files, and the files the portal
# gate's `npm run build:search` derives from them (person-paths.js and growth/sponsors from the roster, the donor
# index and growth/donors.json from the money graphs, growth/agencies from the supplier profiles). A group's put-back
# then puts back what was built from it too, so a test it breaks clears when it alone is reverted (18 Oct 2026: the
# roster export rewrote person-paths.js, which no group owned, and every trial stayed red). The two build outputs in
# BUILD_ONLY_PATHS read every group at once; the gate puts them back to HEAD afterwards and they are never committed.
# shellcheck shell=bash

# order = the order they are validated in
DATA_GROUPS=(bills instruments audit budget vic-gifts bills-tas bills-act evidence votes divisions seovotes corpus wrangler money grants suppliers access expenses interests fits speakers people pay discovery taxcharity video)

declare -A GROUP_PATHS=(
  [bills]="portal/public/bills"
  [instruments]="portal/public/instruments" # weekly FRL metadata only; no DB/KB writes
  [audit]="portal/public/audit" # weekly QAO index + HTML recommendations; no DB/KB writes
  [budget]="portal/public/budget" # reviewed staged snapshot, promoted after exports
  [vic-gifts]="portal/public/vic-gifts" # reviewed periods and exact Victorian roster links
  [bills-tas]="portal/public/bills-tas" # reviewed factual bill metadata and original links
  [bills-act]="portal/public/bills-act" # reviewed factual bill metadata and original links
  [evidence]="portal/public/evidence" # weekly + catch-up; read-only source/sidecars, no KB
  [votes]="portal/public/votes.json" # mobile schema 1; federal legacy tables, state ext_ tables
  [divisions]="portal/public/divisions" # unified ext_ recorded divisions; bill backlinks
  [seovotes]="portal/public/seo/recent-votes.json" # ext_ votes resolved against schema-1 identities
  [corpus]="portal/public/corpus.json"
  [wrangler]="portal/wrangler.jsonc"
  [money]="portal/public/graph/money.json portal/public/graph/money.qld.json portal/public/graph/money.vic.json portal/public/graph/money.tas.json portal/public/graph/donor-disclosures.json portal/public/graph/donor-index.json portal/public/growth/donors.json" # + the weekly donor-disclosure export and the donor index/module built from them
  [grants]="portal/public/graph/grants.federal.json portal/public/grants/federal"
  [suppliers]="portal/public/suppliers.json portal/public/suppliers portal/public/agencies.json portal/public/agencies portal/public/growth/agencies" # + the agency modules built from the profiles
  [access]="portal/public/access.json"
  [expenses]="portal/public/expenses.json"
  [interests]="portal/public/interests" # daily federal (cap 100), weekly QLD; export after each
  [fits]="portal/public/fits.json"
  [speakers]="portal/public/speakers.json"
  [people]="portal/public/parliamentarians.json portal/src/passage-names.json portal/public/person-paths.js portal/public/growth/sponsors portal/public/seo-links.json" # the roster and what the build derives from it (sponsor links read the bills too) travel together
  [pay]="portal/public/pay.json"
  [discovery]="portal/public/discovery.json"
  [taxcharity]="portal/public/entities/tax-charity"
  [video]="portal/public/video" # the Senate's own YouTube uploads (feed, or API with a key); links only, never video bytes
)

# build:search outputs that read every group: rebuilt for each gate trial, put back to HEAD after the gate
BUILD_ONLY_PATHS=(portal/public/search-catalog/manifest.json portal/public/graph/party-members.json)

# The files above that the gate's build (build:search + stamp_assets) derives rather than an exporter writes. Some read
# more than their owner group (growth/sponsors and seo-links.json read the bills as well as the roster), so after a red
# gate whose last build was not made from exactly the data that stays, they all go back to HEAD before staging.
DERIVED_PATHS=(portal/src/passage-names.json portal/public/person-paths.js portal/public/growth/sponsors portal/public/seo-links.json
  portal/public/graph/donor-index.json portal/public/growth/donors.json portal/public/growth/agencies)

# every path of every group, in one list
all_data_paths() {
  local g
  for g in "${DATA_GROUPS[@]}"; do echo ${GROUP_PATHS[$g]}; done | tr ' ' '\n'
}

# Keep directory roots in the allowlist, so git add -A includes new/deleted chunks
# inside an already published group. Entirely unpublished groups remain held.
tracked_data_paths() {
  local p
  while IFS= read -r p; do
    [ -n "$(git ls-tree --name-only HEAD -- "$p" 2>/dev/null)" ] && echo "$p"
  done < <(all_data_paths)
  return 0
}
