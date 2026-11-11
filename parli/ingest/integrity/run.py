"""Refresh integrity commission report snapshots, one body at a time.

    python -m parli.ingest.integrity.run refresh [--body nsw_icac ...] [--offline] [--allow-shrink]

Each adapter's ``collect(client)`` returns its records; ``common.write_snapshot`` guards
them and writes ``<cache>/snapshots/<body>.json``. A body whose host refuses the agent
(401/403/challenge) is paused and keeps its last snapshot; a held body (exit 3 guard)
keeps its last snapshot too. Other bodies continue. Exit 4 if any body was paused, else 3
if any was held, else 0. A body whose adapter sets ``KNOWN_GAP`` (its host does not
answer the identifying agent; see the adapter and the coverage doc) is reported as a gap
and does not change the exit code; any records for it in the committed manual supplement
(``manual.py``) are still written to its snapshot.
"""
from __future__ import annotations

import argparse
import importlib
import json
import traceback

from parli.ingest.integrity import common, manual

ADAPTERS = ("nacc", "nsw_icac", "vic_ibac", "qld_ccc", "wa_ccc", "sa_icac", "tas_ic", "act_ic", "nt_icac")


def refresh_body(code, offline=False, allow_shrink=False, refetch_pdfs=False):
    module = importlib.import_module(f"parli.ingest.integrity.{code}")
    body = module.BODY
    client = common.Client(body, offline=offline, refetch_pdfs=refetch_pdfs)
    gaps = getattr(module, "GAPS", ())
    supplement = manual.load(code)
    try:
        records = module.collect(client)
    except SystemExit:
        # A refusing or unparsed host keeps its gap. Records from the committed manual
        # supplement (publisher PDFs supplied by the maintainer) are still written, so the
        # gap does not hide them; the exit code is unchanged.
        if supplement:
            common.write_snapshot(body, supplement, client, gaps=gaps, min_records=1, allow_shrink=allow_shrink)
        raise
    records = manual.merge(records, supplement)
    return common.write_snapshot(body, records, client, gaps=gaps,
                                 min_records=getattr(module, "MIN_RECORDS", 1), allow_shrink=allow_shrink)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("cmd", choices=["refresh"])
    ap.add_argument("--body", action="append", choices=ADAPTERS)
    ap.add_argument("--offline", action="store_true", help="rebuild from the raw cache only (no requests)")
    ap.add_argument("--allow-shrink", action="store_true")
    ap.add_argument("--refetch-pdfs", action="store_true")
    args = ap.parse_args(argv)
    paused, held, done, gaps = [], [], [], []
    for code in args.body or ADAPTERS:
        try:
            refresh_body(code, args.offline, args.allow_shrink, args.refetch_pdfs)
            done.append(code)
        except SystemExit as exc:  # SourceRefused (4) or Held (3)
            known_gap = getattr(importlib.import_module(f"parli.ingest.integrity.{code}"), "KNOWN_GAP", False)
            (gaps if known_gap else paused if exc.code == 4 else held).append(code)
            print(f"[integrity] {code}: exit {exc.code}; last good snapshot kept", flush=True)
        except Exception:  # noqa: BLE001 - one body's parser fault must not stop the others
            traceback.print_exc()
            held.append(code)
            print(f"[integrity] {code}: adapter error; last good snapshot kept", flush=True)
    print("[integrity] " + json.dumps({"refreshed": done, "held": held, "paused": paused, "known_gaps": gaps}), flush=True)
    raise SystemExit(4 if paused else 3 if held else 0)


if __name__ == "__main__":
    main()
