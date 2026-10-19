#!/usr/bin/env python3
"""Build a fresh, frozen evidence bundle; never select or replace an active bundle.

The caller must hold the nightly/daily/weekly locks. BEGIN IMMEDIATE additionally
freezes source writes until all builders and the reduced source copy finish. It
changes no source records and is always rolled back. Every run uses new outputs;
there is deliberately no resume or incomplete-publication option.
"""
from __future__ import annotations

import argparse
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evidence_inputs import readiness
from evidence_guard import check as publication_check

ROOT = Path(__file__).resolve().parents[2]
SOURCE_TABLES = ("speeches", "ext_press_releases", "government_grants", "postcode_electorates")
BUILD_TABLES = SOURCE_TABLES + ("ext_contract_suppliers", "ext_donor_entities", "ext_grant_recipients",
                               "ext_donor_aliases", "ext_grant_details")
FILENAMES = {"source": "parli.db", "evidence": "evidence-layers-full.sqlite",
             "places": "evidence-places.sqlite", "decisions": "evidence-identity-decisions.sqlite",
             "additional": "evidence-additional-mentions.sqlite"}
ENV_NAMES = {"source": "SOURCE", "evidence": "LAYERS", "places": "PLACES",
             "decisions": "DECISIONS", "additional": "ADDITIONAL"}
MANAGED_BY = "opax-evidence-bundle-v1"


class PublicationHeld(ValueError):
    """A supervised audited candidate was retained without publication readiness."""


def stamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def quoted(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def atomic_json(path: Path, value: dict) -> None:
    descriptor, name = tempfile.mkstemp(prefix=path.name + ".tmp.", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w") as stream:
            json.dump(value, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


class Budget:
    def __init__(self, directory: Path, seconds: float, reserve: int):
        self.directory, self.reserve = directory, reserve
        self.deadline = time.monotonic() + seconds

    def check(self) -> int:
        if time.monotonic() >= self.deadline:
            raise TimeoutError("evidence bundle exceeded its total time budget")
        free = shutil.disk_usage(self.directory).free
        # Stop allocations before the protected reserve is crossed, allowing
        # room for a child to close/roll back during its short termination grace.
        if free < self.reserve + 1024**3:
            raise ValueError(f"evidence bundle disk reserve: {free} bytes free, need {self.reserve} plus 1 GiB allocation headroom")
        return free

    @contextmanager
    def sqlite_guard(self, connection):
        failed = []
        def progress():
            try:
                self.check()
                return 0
            except (ValueError, TimeoutError) as exc:
                failed.append(exc)
                return 1
        connection.set_progress_handler(progress, 100_000)
        try:
            yield
        except sqlite3.OperationalError:
            if failed:
                raise failed[0]
            raise
        finally:
            connection.set_progress_handler(None, 0)


@contextmanager
def freeze_source(path: Path, timeout: float):
    # mode=rw never creates a missing database. The sole reserved write
    # transaction contains no writes; query_only prevents accidental SQL edits.
    for suffix in ("-wal", "-journal"):
        companion = Path(str(path) + suffix)
        if companion.exists() and companion.stat().st_size:
            raise ValueError("source WAL/journal must be checkpointed by the caller while idle before building")
    source = sqlite3.connect(path.resolve().as_uri() + "?mode=rw", uri=True,
                             timeout=timeout, isolation_level=None)
    try:
        source.execute("BEGIN IMMEDIATE")
        source.execute("PRAGMA query_only=ON")
        wal = Path(str(path) + "-wal")
        if wal.exists() and wal.stat().st_size:
            raise ValueError("source WAL must be checkpointed by the caller while idle before building")
        yield source
    finally:
        source.rollback()
        source.close()


def fingerprint(source: sqlite3.Connection) -> dict:
    tables = {}
    for table in BUILD_TABLES:
        row = source.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
        if not row or not row[0] or "WITHOUT ROWID" in row[0].upper():
            raise ValueError(f"required rowid source table missing or unsupported: {table}")
        count, first, last = source.execute(f"SELECT count(*),min(rowid),max(rowid) FROM {quoted(table)}").fetchone()
        tables[table] = {"schema_sha256": hashlib.sha256(row[0].encode()).hexdigest(),
                         "rows": count, "first_rowid": first, "last_rowid": last}
    return {"data_version": source.execute("PRAGMA data_version").fetchone()[0],
            "schema_version": source.execute("PRAGMA schema_version").fetchone()[0], "tables": tables}


def copy_source(source_path: Path, output: Path, budget: Budget) -> None:
    with closing(sqlite3.connect(output)) as target:
        target.execute("PRAGMA foreign_keys=OFF")
        target.execute("PRAGMA journal_mode=DELETE")
        target.execute("ATTACH DATABASE ? AS original", (source_path.resolve().as_uri() + "?mode=ro",))
        with budget.sqlite_guard(target):
            for table in SOURCE_TABLES:
                budget.check()
                sql = target.execute("SELECT sql FROM original.sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()[0]
                columns = target.execute(f"PRAGMA original.table_xinfo({quoted(table)})").fetchall()
                if any(row[6] for row in columns):
                    raise ValueError(f"generated/hidden source columns unsupported: {table}")
                target.execute(sql)
                # INTEGER PRIMARY KEY aliases the rowid, so copying that column
                # retains it. Composite/non-integer keys need an explicit rowid.
                integer_pk = len([row for row in columns if row[5]]) == 1 and any(
                    row[5] == 1 and row[2].upper() == "INTEGER" for row in columns)
                names = [quoted(row[1]) for row in columns]
                if not integer_pk:
                    names.insert(0, "rowid")
                names_sql = ",".join(names)
                target.execute(f"INSERT INTO {quoted(table)} ({names_sql}) SELECT {names_sql} FROM original.{quoted(table)}")
            # Only original table constraints/PK indexes travel. No FTS,
            # unrelated indexes, triggers or mutable registry tables are copied.
        target.commit()


def stop_process(process) -> None:
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()


def run_stage(name: str, argv: list[str], repo: Path, bundle: Path, budget: Budget, metadata: dict) -> None:
    budget.check()
    started = time.monotonic()
    record = {"name": name, "started": stamp(), "log": f"{name}.log"}
    metadata["stages"].append(record)
    with (bundle / record["log"]).open("wb") as log:
        process = subprocess.Popen(argv, cwd=repo, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        try:
            while process.poll() is None:
                budget.check()
                time.sleep(.1)
            if process.returncode:
                raise ValueError(f"evidence stage {name} failed (exit {process.returncode}); see {record['log']}")
        finally:
            stop_process(process)
            record.update(seconds=round(time.monotonic() - started, 3), returncode=process.returncode)
    budget.check()


def verify_databases(paths: dict[str, Path], budget: Budget) -> dict:
    result = {}
    for key, path in paths.items():
        budget.check()
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"missing or unsafe evidence output: {key}")
        # These are new disposable outputs, never the live source. Fold their
        # WALs in place rather than duplicating the large sidecars for backup.
        with closing(sqlite3.connect(path)) as db:
            db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            db.execute("PRAGMA journal_mode=DELETE")
            with budget.sqlite_guard(db):
                if db.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                    raise ValueError(f"invalid evidence database: {key}")
        if any(Path(str(path) + suffix).exists() for suffix in ("-wal", "-shm")):
            raise ValueError(f"output WAL/SHM still present: {key}")
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            while chunk := stream.read(8 * 1024 * 1024):
                budget.check()
                digest.update(chunk)
        result[key] = {"file": path.name, "bytes": path.stat().st_size, "sha256": digest.hexdigest()}
    return result


def build(source: Path, destination: Path, repo: Path = ROOT, timeout_seconds: float = 5400,
          reserve_bytes: int = 5 * 1024**3, lock_timeout: float = 5,
          keep_audited_candidate: bool = False) -> dict:
    if not source.is_file() or source.is_symlink():
        raise ValueError("source must be an existing regular SQLite database")
    source, destination, repo = source.resolve(), destination.resolve(), repo.resolve()
    if (not math.isfinite(timeout_seconds) or not math.isfinite(lock_timeout)
            or timeout_seconds <= 0 or reserve_bytes < 5 * 1024**3 or lock_timeout <= 0):
        raise ValueError("positive time limits and at least the 5 GiB reserve are required")
    if destination.exists() or destination.name.endswith(".incoming"):
        raise ValueError("a fresh versioned bundle destination is required; no resume/replacement")
    bundle = destination.with_name(destination.name + ".incoming")
    destination.parent.mkdir(parents=True, exist_ok=True)
    budget = Budget(destination.parent, timeout_seconds, reserve_bytes)
    free_before = budget.check()
    bundle.mkdir(exist_ok=False)
    paths = {key: bundle / name for key, name in FILENAMES.items()}
    metadata = {"schema": 1, "managed_by": MANAGED_BY, "started": stamp(), "live_source": str(source), "stages": [],
                "free_bytes_before": free_before, "reserve_bytes": reserve_bytes, "verified": False}
    started = time.monotonic()
    try:
        with freeze_source(source, min(lock_timeout, timeout_seconds)) as frozen:
            with budget.sqlite_guard(frozen):
                metadata["source_before"] = fingerprint(frozen)
            commands = (
                ("primary", "build_evidence_layers.py", ["--source", source, "--output", paths["evidence"]]),
                ("places", "build_place_evidence.py", ["--source", source, "--output", paths["places"]]),
                ("decisions", "review_evidence_identities.py", ["--evidence", paths["evidence"], "--output", paths["decisions"]]),
                ("additional", "build_additional_mentions.py", ["--source", source, "--base", paths["evidence"],
                 "--decisions", paths["decisions"], "--places", paths["places"], "--output", paths["additional"]]),
            )
            for name, script, argv in commands:
                run_stage(name, [sys.executable, str(repo / "scripts" / script), *map(str, argv)], repo, bundle, budget, metadata)
            copy_started = time.monotonic()
            copy_source(source, paths["source"], budget)
            metadata["stages"].append({"name": "source_snapshot", "seconds": round(time.monotonic() - copy_started, 3)})
            with budget.sqlite_guard(frozen):
                metadata["source_after"] = fingerprint(frozen)
            if metadata["source_before"] != metadata["source_after"]:
                raise ValueError("source changed during evidence build; bundle cannot be resumed")
        # All remaining work uses the actual frozen copy. Live writers may now
        # proceed without invalidating this candidate's evidence/source pairing.
        metadata["databases"] = verify_databases(paths, budget)
        ready = readiness(paths)
        if ready != "ready":
            raise ValueError(f"evidence coverage incomplete: {ready}")
        export = bundle / "export"
        export_args = [sys.executable, str(repo / "scripts/export_evidence_layers.py")]
        for key, path in paths.items():
            export_args.extend(("--" + key, str(path)))
        export_args.extend(("--output", str(export)))
        run_stage("export", export_args, repo, bundle, budget, metadata)
        run_stage("audit", [sys.executable, str(repo / "scripts/audit_evidence_export.py"),
                  "--source", str(paths["source"]), "--export", str(export)], repo, bundle, budget, metadata)
        budget.check()
        metadata["export_stats"] = json.loads((export / "stats.json").read_text())
        metadata["audited"] = True
        try:
            metadata["publication_guard"] = publication_check(export, repo)
        except ValueError as exc:
            metadata["publication_guard_error"] = str(exc)
            metadata["publication_approved"] = False
            if keep_audited_candidate:
                metadata.update(verified=False, finished=stamp(), seconds=round(time.monotonic() - started, 3),
                                free_bytes_after=budget.check())
                receipt = bundle / "receipt.json"
                report = {"verified": False, "audited": True, "publication_approved": False,
                          "bundle_dir": str(bundle), "receipt": str(receipt),
                          **{key: str(path) for key, path in paths.items()}}
                metadata["report"] = report
                atomic_json(receipt, metadata)
                atomic_json(bundle / "CANDIDATE.json", {"schema": 1, "managed_by": MANAGED_BY,
                            "verified": False, "audited": True, "publication_approved": False,
                            "receipt_sha256": hashlib.sha256(receipt.read_bytes()).hexdigest(), "report": report})
                raise PublicationHeld(f"audited candidate retained; publication guard held: {exc}; receipt: {receipt}") from exc
            raise
        metadata.update(verified=True, finished=stamp(), seconds=round(time.monotonic() - started, 3),
                        publication_approved=True, free_bytes_after=budget.check())
        receipt = bundle / "receipt.json"
        report = {"verified": True, "bundle_dir": str(bundle), "receipt": str(receipt),
                  **{key: str(path) for key, path in paths.items()},
                  "env": {"OPAX_EVIDENCE_" + ENV_NAMES[key]: str(path) for key, path in paths.items()}}
        metadata["report"] = report
        atomic_json(receipt, metadata)
        # This is the sole readiness publication. There is no pointer/config
        # installation, rename over an active bundle, or automatic cleanup.
        atomic_json(bundle / "READY.json", {"schema": 1, "managed_by": MANAGED_BY, "verified": True,
                    "receipt_sha256": hashlib.sha256(receipt.read_bytes()).hexdigest(), "report": report})
        return report
    except PublicationHeld:
        # Only the explicit supervised option can retain these large outputs.
        # No READY marker or verified report exists, so automated activation
        # and verified-bundle pruning cannot mistake them for a release.
        raise
    except BaseException as exc:
        # Only files this fresh invocation owns are removed. Failed candidates
        # cannot resume, so do not strand GiBs below the reserve until a human
        # can clean up. Keep small logs and the failure receipt for diagnosis.
        for path in paths.values():
            for suffix in ("", "-wal", "-shm", "-journal"):
                Path(str(path) + suffix).unlink(missing_ok=True)
        export = bundle / "export"
        if export.is_symlink():
            export.unlink()
        elif export.exists():
            shutil.rmtree(export)
        for name in ("READY.json", "CANDIDATE.json", "receipt.json"):
            (bundle / name).unlink(missing_ok=True)
        metadata.update(verified=False, finished=stamp(), seconds=round(time.monotonic() - started, 3), error=str(exc)[:1000])
        atomic_json(bundle / "FAILED.json", metadata)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", "--db", type=Path, required=True)
    destination = parser.add_mutually_exclusive_group(required=True)
    destination.add_argument("--bundle", type=Path)
    destination.add_argument("--bundle-root", type=Path)
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--timeout-seconds", type=float, default=5400)
    parser.add_argument("--min-free-gib", type=float, default=5)
    parser.add_argument("--lock-timeout-seconds", type=float, default=5)
    parser.add_argument("--keep-audited-candidate", action="store_true",
                        help="supervised review only: retain audited outputs on a strict publication hold; never marks READY")
    args = parser.parse_args()
    target = args.bundle or args.bundle_root / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:12])
    def interrupted(signum, _frame):
        # Children have their own process group. Route outer timeout/systemd
        # termination through run_stage's finally BEFORE source freeze unlocks.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        raise InterruptedError(f"evidence bundle interrupted by signal {signum}")
    previous = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGTERM, signal.SIGINT)}
    try:
        result = build(args.source, target, args.repo, args.timeout_seconds,
                       int(args.min_free_gib * 1024**3), args.lock_timeout_seconds, args.keep_audited_candidate)
        print(json.dumps(result, sort_keys=True))
        return 0
    except PublicationHeld as exc:
        print(f"HELD evidence bundle: {exc}", file=sys.stderr)
        return 3
    except (ValueError, OSError, sqlite3.Error, TimeoutError) as exc:
        print(f"REFUSED evidence bundle: {exc}", file=sys.stderr)
        return 1
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


if __name__ == "__main__":
    sys.exit(main())
