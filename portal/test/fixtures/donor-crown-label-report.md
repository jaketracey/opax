# Donor industry keyword correction

11 November 2026. Industry labels are OPAX's grouping of named donors. They do not establish lobbying or influence.

## Classifier audit

Replaced bare `crown` with `crown resorts`, `crown melbourne`, `crown perth`, `crown sydney` and `crown entertainment`. Added `crown castle` to telecom. Both `classify_donor_name` and the `donations` SQL pass now use the same escaped, case-insensitive patterns with word boundaries for every industry list. First matching industry still wins. Existing non-null database labels are preserved.

Audited all 26 keyword lists and names/aliases in the four money graphs and donor disclosure catalogue. Boundaries prevent collisions involving `gaming`, `lotteries`, `keno`, `tatts`, `coal`, `mineral`, `oil`, `gas`, `ampol`, `bank`, `anz`, `nab`, `pub`, `meta` and union acronyms. Explicit inflections and compound names retain matches such as Mineralogy, banking, pharmaceuticals, GlaxoSmithKline and agricultural names; Allianz and Hospitality Tasmania have explicit rules. Tests cover 461 keywords, 101 name cases, SQL/helper parity, placeholders, individual fallback, idempotence and unchanged amounts.

## Published label changes

Only these `industry` and `group` fields changed. Every published name/alias for each donor agrees under the fixed classifier. These corrections used no network or database. Crown Resorts Limited remains gambling.

| File under `portal/public/graph/` | Donor | Industry before | Industry after | Group before | Group after |
| --- | --- | --- | --- | --- | --- |
| money.json | Crown Castle Australia | gambling | telecom | gambling | media & tech |
| money.json | Publishing and Broadcasting Ltd | hospitality | media | hospitality | media & tech |
| money.json | Rheinmetall Defence Australia Pty Ltd | tech | defence | media & tech | defence & security |
| money.json | Medibank Health Solutions | finance | health | finance | health & pharma |
| money.json | Wesfarmers Limited | agriculture | retail | agriculture | retail |
| money.tas.json | Hospitality Tasmania | health | hospitality | health & pharma | hospitality |

A semantic comparison against the original four graphs confirms that only these twelve fields differ. Amounts, counts, dates, membership, edges, metadata and references are identical. This is a label correction, not a full export.

## Label path and database refresh

`scripts/export_money_graph.py` reads stored `donations.industry` and selects the largest classified industry by amount per canonical donor, subject to union/person safeguards. It writes `industry` and coarser `group` to `money.json`. State exports use `scripts/export_state_money.py` and `ext_donations.industry`. Neither exporter runs the classifier.

The money map and Ask's industry calculations/named-source lists read those nodes. `scripts/build_donor_index.mjs` excludes graph industry/group fields; supplemental disclosure records carry resolver-based `other`/`individual` labels, not the erroneous gambling label. `scripts/build_growth_modules.mjs` also excludes industry/group. Thus `graph/donor-index.json`, `graph/donor-disclosures.json` and `growth/donors.json` need no label edit.

The nightly service runs `scripts/vm/run-nightly.sh`, then `scripts/vm/nightly.sh`. Its periodic weekly group calls `scripts/weekly_refresh.sh weekly`. The exact classification and money export steps in that script are:

```sh
run_step donations_classify "" "$PY" -m parli.ingest.money_classify --db "$DB"
run_step x_money "" "$EXPORT" json portal/public/graph/money.json "$PY" scripts/export_money_graph.py
for j in qld vic tas; do
  run_step "x_money_$j" "" "$EXPORT" json "portal/public/graph/money.$j.json" "$PY" scripts/export_state_money.py "$j"
done
```

Here `DB="$HOME/.cache/autoresearch/parli.db"`, `PY="$REPO/.venv/bin/python"`, `EXPORT="scripts/vm/export_step.sh"` and the script exports `OPAX_DB="$DB"`.

**Repair existing database labels before exporting.** Both classifiers only fill null labels. Also, `parli/ingest/money_classify.py` still implements its own `LIKE '%keyword%'` state pass, despite importing the shared keyword lists. It and the refresh scripts are outside this task's owned files. State ingestion uses the fixed helper via `ext_common.classify_industry`, but the separate pass can still misclassify remaining null rows. A routine refresh could restore old graph labels.

On the database host, review affected raw names, donor types, provenance and entity roll-ups. Repair the six definite labels using `classify_donor_name`, preserving amounts. The separate state pass also needs the shared matcher. For newly unclassified federal rows:

```sh
OPAX_DB="$HOME/.cache/autoresearch/parli.db" .venv/bin/python -m parli.ingest.classify_donations
```

After that database repair, run only the existing offline money exports on that host with:

```sh
OPAX_ONLY=x_money,x_money_qld,x_money_vic,x_money_tas scripts/weekly_refresh.sh weekly
```

These commands are documented, not executed here. A full regeneration needs the nightly database because the published files omit per-spelling industry weights, donor types and provenance.

## Additional collisions needing database review

The fixed classifier returns no industry for these names. Their published labels are deliberately unchanged: the graph alone cannot determine an individual fallback, a reviewed industry or an entity's remaining weighted labels.

| Graph | Donor | Published industry before and after | Old substring |
| --- | --- | --- | --- |
| federal | Asuria People Services Pty Ltd | unions | asu |
| qld | VULY TRAMPOLINES PTY LTD | fossil_fuels | ampol |
| qld | AUSTRALIA ENERGY WINDFARM PTY LTD | agriculture | farm |
| vic | Sustainability Wise Pty Ltd | finance | nab |
| vic | Banksia Strategic Partners Pty Ltd | finance | bank |
| vic | Ranjini Somasundaram | unions | asu |
| vic | Sara Prendergast | fossil_fuels | gas |

Short legacy aliases such as `Crown` and `Crown Limited` now need existing reviewed labels or entity evidence; they cannot safely identify a gambling donor by themselves. Their canonical Crown Resorts graph node and stored non-null labels are retained.

## Validation

Classifier/model tests: 7 passed. Money-source and exporter-colour tests: 28 passed. Regression coverage includes the five requested Crown gambling names, Crown Castle as telecom, other substring collisions and a 1,100-name database batch.

Portal checks use Node 24.21.0. Local build prerequisite: `OPAX_TABLE_METADATA_ONLY=1 npm run build:search`. `WRANGLER_SEND_METRICS=false npm run check` passed; full `npm test`: 4,426 passed, none failed or skipped.

The affected Ask tests now derive expected industry totals independently from graph membership. A published-label regression checks Crown Castle/Crown Resorts. Only `donation_layer_sha256` changed in the follow-up fixture after the label-only comparison; exact local replay passed with every gold row and amount untouched. No production Ask requests or live evaluations were made.
