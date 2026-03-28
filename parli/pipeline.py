"""
parli.pipeline -- Daily automated data pipeline for OPAX.

Orchestrates all data source refreshes, post-ingestion processing,
and analysis steps. Each step runs independently so one failure
does not block the rest.

Usage:
    python -m parli.pipeline              # run full pipeline
    python -m parli.pipeline --step fed   # run one step only
    python -m parli.pipeline --skip fed   # skip specific steps
    python -m parli.pipeline --dry-run    # show what would run
    python -m parli.pipeline --install-cron  # set up daily 2am AEST cron
"""

import argparse
import fcntl
import logging
import os
import signal
import sqlite3
import subprocess
import sys
import textwrap
import time
from datetime import datetime, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PROJECT_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = Path("~/.cache/autoresearch").expanduser()
PIPELINE_LOG_DIR = CACHE_DIR / "pipeline"
LOCK_FILE = PIPELINE_LOG_DIR / "pipeline.lock"
DB_PATH = CACHE_DIR / "parli.db"

STEP_TIMEOUT = 30 * 60  # 30 minutes per step

# ---------------------------------------------------------------------------
# Load .env
# ---------------------------------------------------------------------------

def load_dotenv():
    """Load .env file from project root into os.environ."""
    env_file = PROJECT_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def setup_logging() -> logging.Logger:
    PIPELINE_LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = PIPELINE_LOG_DIR / f"pipeline_{timestamp}.log"

    logger = logging.getLogger("opax_pipeline")
    logger.setLevel(logging.DEBUG)

    # File handler - detailed
    fh = logging.FileHandler(log_file)
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)-7s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.addHandler(fh)

    # Console handler - concise
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter("%(asctime)s %(message)s", datefmt="%H:%M:%S"))
    logger.addHandler(ch)

    logger.info("Log file: %s", log_file)
    return logger


# ---------------------------------------------------------------------------
# Lock file
# ---------------------------------------------------------------------------

class PipelineLock:
    """PID-based lock file to prevent concurrent runs."""

    def __init__(self, path: Path):
        self.path = path
        self._fd = None

    def acquire(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fd = open(self.path, "w")
        try:
            fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            # Check if the holding process is still alive
            try:
                old_pid = int(self.path.read_text().strip())
                os.kill(old_pid, 0)  # signal 0 = existence check
                raise SystemExit(
                    f"Pipeline already running (PID {old_pid}). "
                    f"Remove {self.path} if stale."
                )
            except (ValueError, ProcessLookupError, PermissionError):
                # Stale lock -- steal it
                self._fd.close()
                self.path.unlink(missing_ok=True)
                self._fd = open(self.path, "w")
                fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self._fd.write(str(os.getpid()))
        self._fd.flush()

    def release(self):
        if self._fd:
            fcntl.flock(self._fd, fcntl.LOCK_UN)
            self._fd.close()
            self.path.unlink(missing_ok=True)
            self._fd = None


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    """Open DB with 5-minute busy timeout."""
    db = sqlite3.connect(str(DB_PATH), timeout=300)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 300000")
    return db


def count_rows(table: str) -> int:
    try:
        db = get_db()
        n = db.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
        db.close()
        return n
    except Exception:
        return -1


# ---------------------------------------------------------------------------
# Step runner
# ---------------------------------------------------------------------------

def run_command(cmd: str, logger: logging.Logger, dry_run: bool = False,
                timeout: int = STEP_TIMEOUT) -> tuple[bool, str]:
    """Run a shell command. Returns (success, output_snippet)."""
    if dry_run:
        logger.info("  [DRY RUN] %s", cmd)
        return True, "(dry run)"

    logger.debug("  CMD: %s", cmd)
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            cwd=str(PROJECT_DIR),
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
        output = (result.stdout or "") + (result.stderr or "")
        # Log last 20 lines of output
        tail = "\n".join(output.strip().splitlines()[-20:])
        if result.returncode != 0:
            logger.warning("  FAILED (exit %d):\n%s", result.returncode, tail)
            return False, tail
        else:
            logger.debug("  OK:\n%s", tail)
            return True, tail
    except subprocess.TimeoutExpired:
        logger.error("  TIMEOUT after %ds: %s", timeout, cmd)
        return False, f"Timed out after {timeout}s"
    except Exception as e:
        logger.error("  ERROR: %s", e)
        return False, str(e)


# ---------------------------------------------------------------------------
# Step definitions
# ---------------------------------------------------------------------------

def _date_ago(days: int) -> str:
    return (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")


def build_steps() -> list[dict]:
    """Return ordered list of pipeline steps."""
    seven_days_ago = _date_ago(7)
    thirty_days_ago = _date_ago(30)

    steps = [
        # --- Data source refreshes ---
        {
            "name": "fed_hansard",
            "group": "ingest",
            "label": "Federal Hansard (last 7 days)",
            "cmd": f"uv run python download_hansard_fast.py --start {seven_days_ago} --workers 5",
            "table": "speeches",
        },
        {
            "name": "vic_hansard",
            "group": "ingest",
            "label": "VIC Hansard (last 30 days)",
            "cmd": f"uv run python -m parli.ingest.vic_parliament --since {thirty_days_ago} --max-days 60",
            "table": "speeches",
        },
        {
            "name": "nsw_hansard",
            "group": "ingest",
            "label": "NSW Hansard (last 30 days)",
            "cmd": f"uv run python -m parli.ingest.nsw_hansard --start {thirty_days_ago}",
            "table": "speeches",
        },
        {
            "name": "qld_hansard",
            "group": "ingest",
            "label": "QLD Hansard",
            "cmd": "uv run python -m parli.ingest.qld_parliament --hansard-only",
            "table": "speeches",
        },
        {
            "name": "sa_hansard",
            "group": "ingest",
            "label": "SA Hansard (last 30 days)",
            "cmd": f"uv run python -m parli.ingest.sa_hansard --since {thirty_days_ago}",
            "table": "speeches",
        },
        {
            "name": "divisions",
            "group": "ingest",
            "label": "Division votes (TVFY)",
            "cmd": "uv run python parli/ingest/fetch_division_votes.py",
            "table": "votes",
        },
        {
            "name": "guardian",
            "group": "ingest",
            "label": "Guardian news articles",
            "cmd": "uv run python -m parli.ingest.guardian_news --all-topics --limit 100",
            "table": "news_articles",
        },
        {
            "name": "austender",
            "group": "ingest",
            "label": "AusTender contracts",
            "cmd": "uv run python -m parli.ingest.austender",
            "table": "contracts",
        },
        {
            "name": "committees",
            "group": "ingest",
            "label": "Committee hearings",
            "cmd": "uv run python -m parli.ingest.committee_hearings",
            "table": None,
        },
        {
            "name": "ipea_expenses",
            "group": "ingest",
            "label": "IPEA parliamentary expenses (quarterly)",
            "cmd": "uv run python -m parli.ingest.ipea_expenses --since 2024",
            "table": "mp_expenses",
        },

        # --- Post-ingestion processing ---
        {
            "name": "link_speakers",
            "group": "process",
            "label": "Link speakers to members",
            "cmd": "uv run python -m parli.ingest.link_speakers",
            "table": None,
        },
        {
            "name": "classify",
            "group": "process",
            "label": "Topic classification",
            "cmd": "uv run python classify_state_speeches.py",
            "table": "speech_topics",
        },
        {
            "name": "embeddings",
            "group": "process",
            "label": "Rebuild embeddings",
            "cmd": "uv run python -m parli.embeddings",
            "table": None,
        },
        {
            "name": "fts5",
            "group": "process",
            "label": "Rebuild FTS5 index",
            "cmd": (
                "uv run python -c \""
                "from parli.schema import get_db; "
                "db = get_db(); "
                "db.execute('PRAGMA busy_timeout = 300000'); "
                "db.execute(\\\"INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')\\\"); "
                "db.commit(); "
                "print('FTS5 rebuild complete')"
                "\""
            ),
            "table": None,
        },

        # --- Analysis ---
        {
            "name": "disconnect",
            "group": "analysis",
            "label": "Disconnect scores",
            "cmd": "uv run python -m parli.analysis.disconnect --rebuild",
            "table": "mp_disconnect_scores",
        },
        {
            "name": "donor_influence",
            "group": "analysis",
            "label": "Donor influence scores",
            "cmd": "uv run python -m parli.analysis.donor_influence",
            "table": "donor_influence_scores",
        },
        {
            "name": "contract_links",
            "group": "analysis",
            "label": "Contract-speech links",
            "cmd": "uv run python -m parli.analysis.contract_speech_links",
            "table": "contract_speech_links",
        },
        {
            "name": "topic_insights",
            "group": "analysis",
            "label": "Topic insights",
            "cmd": "uv run python -m parli.analysis.topic_insights",
            "table": None,
        },
        {
            "name": "mp_insights",
            "group": "analysis",
            "label": "MP insights (top 200)",
            "cmd": "uv run python -m parli.analysis.mp_insights --limit 200",
            "table": None,
        },
        {
            "name": "stories",
            "group": "analysis",
            "label": "Story generation",
            "cmd": "uv run python -m parli.analysis.stories",
            "table": None,
        },
    ]
    return steps


# ---------------------------------------------------------------------------
# Cron installer
# ---------------------------------------------------------------------------

def install_cron():
    """Install daily cron job at 2am AEST (16:00 UTC)."""
    load_dotenv()
    python = sys.executable
    pipeline_cmd = f"{python} -m parli.pipeline"
    cron_line = f"0 16 * * * cd {PROJECT_DIR} && {pipeline_cmd} >> {PIPELINE_LOG_DIR}/cron.log 2>&1"

    # Read existing crontab
    try:
        result = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
        existing = result.stdout if result.returncode == 0 else ""
    except FileNotFoundError:
        existing = ""

    # Check if already installed
    if "parli.pipeline" in existing:
        print("Cron job already installed. Current entry:")
        for line in existing.splitlines():
            if "parli.pipeline" in line:
                print(f"  {line}")
        return

    # Append new cron entry
    new_crontab = existing.rstrip("\n") + "\n" + cron_line + "\n"
    proc = subprocess.run(
        ["crontab", "-"],
        input=new_crontab,
        capture_output=True,
        text=True,
    )
    if proc.returncode == 0:
        print(f"Cron job installed: daily at 2am AEST (16:00 UTC)")
        print(f"  {cron_line}")
    else:
        print(f"Failed to install cron: {proc.stderr}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="OPAX daily data pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Steps (use with --step or --skip):
              ingest:    fed_hansard, vic_hansard, nsw_hansard, qld_hansard,
                         sa_hansard, divisions, guardian, austender, committees
              process:   link_speakers, classify, embeddings, fts5
              analysis:  disconnect, donor_influence, contract_links,
                         topic_insights, mp_insights, stories
        """),
    )
    parser.add_argument(
        "--step", action="append", default=[],
        help="Run only these steps (repeatable). Can also use group names: ingest, process, analysis.",
    )
    parser.add_argument(
        "--skip", action="append", default=[],
        help="Skip these steps (repeatable). Can also use group names.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Show what would run without executing.")
    parser.add_argument("--install-cron", action="store_true", help="Install daily cron job and exit.")
    parser.add_argument("--timeout", type=int, default=STEP_TIMEOUT, help="Per-step timeout in seconds (default: 1800).")
    args = parser.parse_args()

    if args.install_cron:
        install_cron()
        return

    # Load env vars
    load_dotenv()

    # Setup
    logger = setup_logging()
    logger.info("=" * 60)
    logger.info("OPAX Pipeline starting")
    logger.info("=" * 60)

    # Acquire lock
    lock = PipelineLock(LOCK_FILE)
    if not args.dry_run:
        try:
            lock.acquire()
        except SystemExit as e:
            logger.error(str(e))
            sys.exit(1)

    steps = build_steps()

    # Expand group names in --step and --skip
    group_names = {"ingest", "process", "analysis"}

    def expand_names(names: list[str]) -> set[str]:
        result = set()
        for n in names:
            if n in group_names:
                result.update(s["name"] for s in steps if s["group"] == n)
            else:
                result.add(n)
        return result

    only_steps = expand_names(args.step) if args.step else None
    skip_steps = expand_names(args.skip)

    # Snapshot row counts before
    before_counts = {}
    for step in steps:
        if step["table"]:
            before_counts[step["table"]] = count_rows(step["table"])

    # Run pipeline
    results = {}
    t0 = time.time()

    for step in steps:
        name = step["name"]

        # Filter
        if only_steps and name not in only_steps:
            continue
        if name in skip_steps:
            logger.info("[SKIP]    %-22s %s", name, step["label"])
            results[name] = ("skipped", 0)
            continue

        logger.info("[START]   %-22s %s", name, step["label"])
        step_t0 = time.time()

        ok, output = run_command(step["cmd"], logger, dry_run=args.dry_run, timeout=args.timeout)
        elapsed = time.time() - step_t0

        status = "ok" if ok else "FAILED"
        logger.info("[%-6s]  %-22s (%.0fs)", status, name, elapsed)
        results[name] = (status, elapsed)

    total_elapsed = time.time() - t0

    # Snapshot row counts after
    after_counts = {}
    for step in steps:
        if step["table"]:
            after_counts[step["table"]] = count_rows(step["table"])

    # Release lock
    if not args.dry_run:
        lock.release()

    # Print summary
    logger.info("")
    logger.info("=" * 60)
    logger.info("PIPELINE SUMMARY  (total %.0fs / %.1f min)", total_elapsed, total_elapsed / 60)
    logger.info("=" * 60)

    ok_count = sum(1 for s, _ in results.values() if s == "ok")
    fail_count = sum(1 for s, _ in results.values() if s == "FAILED")
    skip_count = sum(1 for s, _ in results.values() if s == "skipped")

    logger.info("Steps: %d ok, %d failed, %d skipped", ok_count, fail_count, skip_count)

    if fail_count:
        logger.info("")
        logger.info("Failed steps:")
        for name, (status, _) in results.items():
            if status == "FAILED":
                logger.info("  - %s", name)

    # Data changes
    changed_tables = []
    for table in sorted(set(before_counts) | set(after_counts)):
        b = before_counts.get(table, -1)
        a = after_counts.get(table, -1)
        if b >= 0 and a >= 0 and a != b:
            diff = a - b
            sign = "+" if diff > 0 else ""
            changed_tables.append((table, b, a, diff))
            logger.info("  %-30s %s%d (was %d, now %d)", table, sign, diff, b, a)

    if not changed_tables and not args.dry_run:
        logger.info("  (no row count changes)")

    # Invalidate cached API responses after pipeline run
    if not args.dry_run:
        try:
            from parli.cache import invalidate_all
            n = invalidate_all()
            logger.info("Cache: invalidated %d keys", n)
        except Exception as e:
            logger.warning("Cache invalidation skipped: %s", e)

    logger.info("")
    logger.info("Done.")


if __name__ == "__main__":
    main()
