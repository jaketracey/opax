#!/usr/bin/env python3
"""The last lines of each failed refresh step's log, made safe to publish.

    python3 scripts/vm/step_tails.py --pipe ~/.cache/autoresearch/pipeline --env-file .env \
        --env-file ~/.config/opax/nightly.env ipea x_fits

nightly.sh puts the result in status.json as `failed_step_logs`, so a failed step can be explained without
logging in to the box (16 Nov 2026: `ipea (rc=1)` and nothing else to go on). status.json is force-pushed to
the `nightly-status` branch of a PUBLIC repository, so every line here is treated as published:

  * only steps named as failed, only `<pipe>/<step>.log`, and a step name must be a plain identifier;
  * at most the last MAX_LINES lines and MAX_BYTES bytes per step, each line cut at MAX_LINE characters;
  * pass 1 replaces every credential value this run knows: each value in the given env files and each
    environment variable whose name looks like a credential, raw and URL-encoded;
  * pass 2 masks whatever is merely shaped like one: Authorization and key=value secrets, URL credentials and
    query strings, email addresses, IP addresses, home directories, and long hex or base64 runs.

Pass 2 is deliberately blunt (a commit hash or a long id is masked too): a tail that says less is the safe
failure. Prints a JSON object {step: [line, ...]}; a step with no readable log is left out. Always exits 0.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path

MAX_LINES = 15
MAX_BYTES = 2048
MAX_LINE = 300
READ_BYTES = 65536
MIN_SECRET = 6

STEP_NAME = re.compile(r"[A-Za-z0-9_]{1,64}")
CREDENTIAL_NAME = re.compile(r"KEY|TOKEN|SECRET|PASS|CREDENTIAL|AUTH|COOKIE|SESSION|_R2_|ARAG|NUA|DSN|WEBHOOK", re.I)
# values that are configuration, not credentials, even under a credential-looking name
PLAIN_VALUES = {"true", "false", "none", "null", "unset"}

SECRET_ASSIGNMENT = re.compile(
    r"(?i)\b([A-Za-z0-9_.-]*(?:key|token|secret|passw(?:or)?d|credential|authorization|cookie|signature|sig)[A-Za-z0-9_.-]*)"
    r"(\s*[=:]\s*|\"\s*:\s*\"?|'\s*:\s*'?)(?:bearer\s+|basic\s+)?[^\s\"',;&]+")
AUTH_SCHEME = re.compile(r"(?i)\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}")
URL_USERINFO = re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://)[^/\s@]+@")
URL_QUERY = re.compile(r"(?i)(\b[a-z][a-z0-9+.-]*://[^\s?#\"'<>]+)\?[^\s\"'<>]*")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
IPV4 = re.compile(r"(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])")
IPV6 = re.compile(r"(?<![0-9A-Fa-f:])(?:[0-9A-Fa-f]{1,4}:){3,7}[0-9A-Fa-f]{0,4}(?![0-9A-Fa-f:])")
HOME_DIR = re.compile(r"(?:/home|/Users)/[^/\s\"':]+")
LONG_HEX = re.compile(r"(?<![0-9A-Za-z])[0-9A-Fa-f]{16,}(?![0-9A-Za-z])")
# a base64 or URL-safe base64 run: long, and mixed enough not to be a word or a path segment
LONG_BASE64 = re.compile(r"(?<![A-Za-z0-9+/_=-])[A-Za-z0-9+/_-]{24,}={0,2}(?![A-Za-z0-9+/_=-])")
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")


def env_file_values(path: Path) -> set[str]:
    """Every value assigned in a KEY=VALUE file, quotes removed. The whole file counts: it holds credentials."""
    values = set()
    try:
        text = path.read_text(errors="replace")
    except OSError:
        return values
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        value = line.split("=", 1)[1].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values.add(value)
    return values


def known_secrets(environ: dict, env_files: list[Path]) -> list[str]:
    """Credential values to replace wherever they appear, longest first, with their URL-encoded forms."""
    values = set()
    for path in env_files:
        values |= env_file_values(path)
    values |= {value for name, value in environ.items() if CREDENTIAL_NAME.search(name)}
    out = set()
    for value in values:
        if len(value) < MIN_SECRET or value.lower() in PLAIN_VALUES or value.isdigit():
            continue
        out |= {value, urllib.parse.quote(value, safe=""), urllib.parse.quote_plus(value)}
    return sorted(out, key=len, reverse=True)


def _mask_base64(match: re.Match) -> str:
    """Mask the run unless it is plainly a word or a lowercase path (one character class only)."""
    run = match.group(0)
    classes = sum(bool(re.search(pattern, run)) for pattern in (r"[a-z]", r"[A-Z]", r"\d"))
    return "[redacted]" if classes >= 2 else run


URL_PATH = re.compile(r"(?i)\b[a-z][a-z0-9+.-]*://[^\s?#\"'<>]+")


def _mask_long_runs(line: str) -> str:
    """Long base64-like runs, masked. `/` is a base64 character, so a URL's host and path would read as one run
    and the address a step failed on would be lost: inside a URL each path segment is judged on its own."""
    out, last = [], 0
    for match in URL_PATH.finditer(line):
        out.append(LONG_BASE64.sub(_mask_base64, line[last:match.start()]))
        out.append("/".join(LONG_BASE64.sub(_mask_base64, part) for part in match.group(0).split("/")))
        last = match.end()
    out.append(LONG_BASE64.sub(_mask_base64, line[last:]))
    return "".join(out)


def redact(line: str, secrets: list[str], home: str = "") -> str:
    line = CONTROL.sub(" ", line)
    for secret in secrets:                      # pass 1: what this run knows to be a credential
        line = line.replace(secret, "[redacted]")
    if home and len(home) > 1:                  # pass 2: what is only shaped like one
        line = line.replace(home, "~")
    line = HOME_DIR.sub("~", line)
    line = URL_USERINFO.sub(r"\1[redacted]@", line)
    line = URL_QUERY.sub(r"\1?[redacted]", line)
    line = SECRET_ASSIGNMENT.sub(lambda m: f"{m.group(1)}{m.group(2)}[redacted]", line)
    line = AUTH_SCHEME.sub(lambda m: f"{m.group(1)} [redacted]", line)
    line = EMAIL.sub("[email]", line)
    line = IPV4.sub("[ip]", line)
    line = IPV6.sub("[ip]", line)
    line = LONG_HEX.sub("[redacted]", line)
    line = _mask_long_runs(line)
    if len(line) > MAX_LINE:
        line = line[:MAX_LINE] + " [cut]"
    return line.rstrip()


def tail(path: Path, secrets: list[str], home: str = "") -> list[str]:
    try:
        with open(path, "rb") as handle:
            handle.seek(0, os.SEEK_END)
            size = handle.tell()
            handle.seek(max(0, size - READ_BYTES))
            raw = handle.read().decode("utf-8", errors="replace")
    except OSError:
        return []
    lines = [line for line in raw.splitlines() if line.strip()]
    if size > READ_BYTES and lines:
        lines = lines[1:]                       # the first line of a partial read may start mid-line
    lines = [redact(line, secrets, home) for line in lines[-MAX_LINES:]]
    while lines and sum(len(line.encode()) + 1 for line in lines) > MAX_BYTES:
        lines = lines[1:]                       # the end of the log is what explains the failure
    return lines


def step_tails(pipe: Path, steps: list[str], environ: dict, env_files: list[Path]) -> dict[str, list[str]]:
    secrets = known_secrets(environ, env_files)
    home = environ.get("HOME", "")
    out = {}
    for step in steps:
        if not STEP_NAME.fullmatch(step) or step in out:
            continue
        lines = tail(pipe / f"{step}.log", secrets, home)
        if lines:
            out[step] = lines
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pipe", required=True, type=Path)
    parser.add_argument("--env-file", action="append", default=[], type=Path)
    parser.add_argument("steps", nargs="*")
    args = parser.parse_args(argv)
    try:
        result = step_tails(args.pipe, args.steps, dict(os.environ), args.env_file)
    except Exception as error:   # never the reason a status is not published
        result = {}
        print(f"step_tails: {type(error).__name__}", file=sys.stderr)
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
