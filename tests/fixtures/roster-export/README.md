# Roster export replay

`prints-23cad95a.json` freezes the public roster's raw identity, scope, year and
seat fields at the `source_commit` recorded in the file. It deliberately keeps
the bad aliases and seats that the repair must correct. Speech totals and
representation descriptions are omitted; the test builds at least six distinct
SQL speech rows per printed name with the original scope/year combinations.

The test creates real `members` and `speeches` tables using the production
schema, leaves member start dates absent outside Queensland (as the box's
loaders do), and runs `export_people.sh` through the production SQL exporter,
the shared repair, representation enrichment and final hold check. The expected
identities come from the shipped roster, with the existing limit of 25 changes.

Run `python3 -m unittest scripts.test_roster_export_wrappers`. No desktop
connection, remote Git ref, network calls or credentials are needed.
