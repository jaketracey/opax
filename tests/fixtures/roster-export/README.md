# Roster export replay

`prints-23cad95a.json` freezes the public roster's raw identity, scope, year and
seat fields at the `source_commit` recorded in the file. It deliberately keeps
the bad aliases and seats that the repair must correct. Original speech and
witness totals preserve which side of the strict-majority threshold each print
falls on. Representation descriptions are omitted; the test builds at least six
distinct SQL speech rows per printed name with the original scope/year
combinations and witness proportion (scaled down, with at least one speaker).

The test creates real `members` and `speeches` tables using the production
schema, leaves member start dates absent outside Queensland (as the box's
loaders do), and runs `export_people.sh` through the production SQL exporter,
the shared repair, representation enrichment and final hold check. The expected
identities come from the shipped roster, with the existing limit of 25 changes.

Run `python3 -m unittest scripts.test_roster_export_wrappers`. No desktop
connection, remote Git ref, network calls or credentials are needed.

`main-66e75d74.json` separately freezes **complete records**, including representation
basis and provenance, from the current `origin/main` (`66e75d74`); its roster records are identical
to the earlier `23cad95a` raw export snapshot. The round-3 audit compares every
field and rejects clean-record changes. The raw SQL replay fixture remains unchanged.
Witness neutralisation now applies only above 50%; ties retain main unless there
is separate evidence of a mix-up.
