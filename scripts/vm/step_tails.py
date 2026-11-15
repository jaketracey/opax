#!/usr/bin/env python3
"""The last lines of each failed refresh step's log, made safe to publish.

    python3 scripts/vm/step_tails.py --pipe ~/.cache/autoresearch/pipeline --env0 dump --env-file .env \
        --env-file ~/.config/opax/nightly.env [--out tails.json] ipea x_fits

nightly.sh puts the result in status.json as `failed_step_logs`, so a failed step can be explained without
logging in to the box (16 Nov 2026: `ipea (rc=1)` and nothing else to go on). status.json is force-pushed to
the `nightly-status` branch of a PUBLIC repository, so every line here is treated as published:

  * only steps named as failed, only `<pipe>/<step>.log`, and a step name must be a plain identifier;
  * at most the last MAX_LINES lines and MAX_BYTES bytes per step, each line cut at MAX_LINE characters;
  * pass 1 replaces every credential value this run knows: each value the env files give a step (taken from
    `env -0` after bash itself sourced them, so quotes, comments and `export` are read as the steps read them)
    and each environment variable whose name looks like a credential, raw and percent-encoded every usual way;
    A known value is also matched as JSON or repr would print it, and line by line when it spans lines.
    Not covered, so a residual risk: a value shorter than 6 characters, an all-digit value shorter than 8, and
    a value a step wraps across two log lines or transforms (hashes, base64s, truncates) before printing;
  * pass 2 masks whatever is merely shaped like one: Authorization and key=value secrets (quoted or bare), a
    token after a secret word, AWS key ids, URL credentials and query strings, email addresses, IP addresses,
    home directories, and long hex or base64 runs;
  * a log is read only if it is a regular file (no symlink, device or FIFO), never more than its last 64 KiB,
    and all tails together stay under MAX_TOTAL bytes and MAX_STEPS steps.

Pass 2 is deliberately blunt (a commit hash or a long id is masked too): a tail that says less is the safe
failure. Prints a JSON object {step: [line, ...]}; a step with no readable log is left out. Always exits 0.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import stat
import sys
import urllib.parse
from pathlib import Path

MAX_LINES = 15
MAX_BYTES = 2048
MAX_LINE = 300
READ_BYTES = 65536
MIN_SECRET = 6
MIN_DIGITS = 8          # an all-digit value this long is a PIN or an id, not a count or a port
PRE_CUT = 4096          # characters of a line that are redacted at all; the rest is dropped first
MAX_STEPS = 40          # failed steps shown; the rest are counted
MAX_TOTAL = 49152       # bytes of JSON for all tails together

STEP_NAME = re.compile(r"[A-Za-z0-9_]{1,64}")
CREDENTIAL_NAME = re.compile(r"KEY|TOKEN|SECRET|PASS|CREDENTIAL|AUTH|COOKIE|SESSION|_R2_|ARAG|NUA|DSN|WEBHOOK", re.I)
# values that are configuration, not credentials, even under a credential-looking name
PLAIN_VALUES = {"true", "false", "none", "null", "unset"}

SECRET_WORD = r"(?:key|token|secret|passw(?:or)?d|credential|authorization|cookie|signature|sig)"
# name = value, name: value, "name": "value": the value may be quoted (then it runs to the closing quote, whatever
# it holds) or bare (then it runs to the next space or quote: a `,`, `;` or `&` inside it must not end the mask)
SECRET_ASSIGNMENT = re.compile(
    # the name ends with the secret word (api_key, x-api-key, ARAG_KB_TOKEN, access_key_id): KeyError: 'x' is not one
    r"(?i)\b([A-Za-z0-9_.-]*" + SECRET_WORD + r"(?:[_-]?(?:id|value|b64|\d+))?)"
    r"([\"']?\s*[=:]\s*)(?:bearer\s+|basic\s+)?(?:\"[^\"]*\"?|'[^']*'?|[^\s\"']+)")
# "invalid key Wb7Nc3Kd9Fq2": a secret word, then a token that is not a word (two character classes, 8 or more)
SECRET_WORD_VALUE = re.compile(r"(?i)\b(" + SECRET_WORD + r")(\s+)(?=[^\s]*\d)(?=[^\s]*[A-Za-z])([A-Za-z0-9+/_=.~-]{8,})")
AWS_KEY_ID = re.compile(r"(?<![0-9A-Za-z])(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Za-z])")
AUTH_SCHEME = re.compile(r"(?i)\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}")
# greedy to the last @ before the path: a password may hold an @ of its own
URL_USERINFO = re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://)[^/\s]+@")
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
    """Every value assigned in a KEY=VALUE file. The whole file counts: it holds credentials.

    The refresh scripts load these files with `set -a; . file`, so the value a step sees is the one bash parses:
    quotes removed and a trailing ` # comment` dropped. Each line is read every way it could be meant (the shell
    word, the text before ` #`, the bare remainder, each with and without quotes), because a value learned with
    its comment attached matches nothing in a log."""
    values = set()
    try:
        text = path.read_text(errors="replace")
    except OSError:
        return values
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        rest = line.split("=", 1)[1].strip()
        forms = {rest, re.split(r"\s+#", rest, maxsplit=1)[0].strip()}
        try:
            words = shlex.split(rest, comments=True)
            if words:
                forms.add(words[0])
        except ValueError:
            pass                                 # an unbalanced quote: the other readings stand
        for form in list(forms):
            if len(form) >= 2 and form[0] == form[-1] and form[0] in "\"'":
                forms.add(form[1:-1])
        values |= forms
    return values


def encoded_forms(value: str) -> set[str]:
    """The value as it may appear in a URL or a log of one: percent-encoded every usual way, in either hex
    case, and with `+` read back as a space."""
    forms = {value, value.replace("+", " ")}
    # as a program prints it inside a string: JSON and repr escape quotes, backslashes and line ends
    forms |= {json.dumps(value)[1:-1], json.dumps(value, ensure_ascii=False)[1:-1], repr(value)[1:-1],
              value.replace("\\", "\\\\").replace('"', '\\"'), value.replace("\\", "\\\\").replace("'", "\\'")}
    for quoted in (urllib.parse.quote(value, safe=""), urllib.parse.quote(value), urllib.parse.quote_plus(value)):
        forms.add(quoted)
        forms.add(re.sub(r"%[0-9A-F]{2}", lambda m: m.group(0).lower(), quoted))
    return forms


# what a clean shell holds before it has sourced anything: not from the files, so not secrets
SHELL_OWN = {"PWD", "OLDPWD", "SHLVL", "_", "PATH", "HOME"}


def env0_values(path: Path) -> set[str]:
    """Every value in a NUL-separated NAME=VALUE dump (`env -0`) that nightly.sh makes by sourcing the env files
    in a clean bash: exactly what the refresh steps see, with bash's own quoting, comments and `export`."""
    try:
        data = path.read_bytes().decode("utf-8", errors="replace")
    except OSError:
        return set()
    values = set()
    for item in data.split("\0"):
        name, sep, value = item.partition("=")
        if sep and name not in SHELL_OWN:
            values.add(value)
    return values


def known_secrets(environ: dict, env_files: list[Path], env0_files: list[Path] = ()) -> list[str]:
    """Credential values to replace wherever they appear, longest first, with their URL-encoded forms."""
    values = set()
    for path in env0_files:
        values |= env0_values(path)
    for path in env_files:                       # read here as well: a second opinion if the shell dump is missing
        values |= env_file_values(path)
    values |= {value for name, value in environ.items() if CREDENTIAL_NAME.search(name)}
    out = set()
    for value in values:
        if len(value) < MIN_SECRET or value.lower() in PLAIN_VALUES or (value.isdigit() and len(value) < MIN_DIGITS):
            continue
        # the whole value, and each line of a value that spans lines (a key file printed line by line)
        for part in {value, *(line.strip() for line in value.splitlines())}:
            if len(part) < MIN_SECRET or (part.isdigit() and len(part) < MIN_DIGITS):
                continue
            out |= {form for form in encoded_forms(part) if len(form) >= MIN_SECRET}
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
    # Cut first: the patterns below are slow on a very long line (64 KiB of `a.b-c_d.` took 84 s, past the
    # caller's timeout, so no tails at all). A secret split by this cut lies far beyond MAX_LINE and is dropped.
    line = CONTROL.sub(" ", line[:PRE_CUT])
    # name=value secrets go first: a known value that is itself a word (GRANT_TYPE=password) would otherwise
    # rewrite the name in `password=...` and leave the value standing
    line = SECRET_ASSIGNMENT.sub(lambda m: f"{m.group(1)}{m.group(2)}[redacted]", line)
    line = SECRET_WORD_VALUE.sub(lambda m: f"{m.group(1)}{m.group(2)}[redacted]", line)
    for secret in secrets:                      # pass 1: what this run knows to be a credential
        line = line.replace(secret, "[redacted]")
    if home and len(home) > 1:                  # pass 2: what is only shaped like one
        line = line.replace(home, "~")
    line = HOME_DIR.sub("~", line)
    line = URL_USERINFO.sub(r"\1[redacted]@", line)
    line = URL_QUERY.sub(r"\1?[redacted]", line)
    line = SECRET_ASSIGNMENT.sub(lambda m: f"{m.group(1)}{m.group(2)}[redacted]", line)
    line = SECRET_WORD_VALUE.sub(lambda m: f"{m.group(1)}{m.group(2)}[redacted]", line)
    line = AWS_KEY_ID.sub("[redacted]", line)
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
    # A step log is a regular file the refresh wrote. Anything else (a symlink to another file or to a device
    # that never ends, a FIFO that never opens) is not read, and no read is longer than READ_BYTES.
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    except OSError:
        return []
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            return []
        size = info.st_size
        os.lseek(fd, max(0, size - READ_BYTES), os.SEEK_SET)
        raw = os.read(fd, READ_BYTES).decode("utf-8", errors="replace")
    except OSError:
        return []
    finally:
        os.close(fd)
    lines = [line for line in raw.splitlines() if line.strip()]
    if size > READ_BYTES and lines:
        lines = lines[1:]                       # the first line of a partial read may start mid-line
    lines = [redact(line, secrets, home) for line in lines[-MAX_LINES:]]
    while lines and sum(len(line.encode()) + 1 for line in lines) > MAX_BYTES:
        lines = lines[1:]                       # the end of the log is what explains the failure
    return lines


def step_tails(pipe: Path, steps: list[str], environ: dict, env_files: list[Path],
               env0_files: list[Path] = ()) -> dict[str, list[str]]:
    secrets = known_secrets(environ, env_files, env0_files)
    home = environ.get("HOME", "")
    out, omitted, used = {}, 0, 2
    for step in steps:
        if not STEP_NAME.fullmatch(step) or step in out:
            continue
        lines = tail(pipe / f"{step}.log", secrets, home)
        if not lines:
            continue
        cost = len(json.dumps({step: lines})) + 2
        if len(out) >= MAX_STEPS or used + cost > MAX_TOTAL:
            omitted += 1                          # a night with very many failed steps: say so, stay small
            continue
        out[step] = lines
        used += cost
    if omitted:
        out["_omitted"] = [f"{omitted} more failed step(s) not shown"]
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pipe", required=True, type=Path)
    parser.add_argument("--env-file", action="append", default=[], type=Path)
    parser.add_argument("--env0", action="append", default=[], type=Path,
                        help="a NUL-separated environment dump made by sourcing the env files in bash")
    parser.add_argument("--out", type=Path, help="write the JSON here (mode 600) instead of stdout")
    parser.add_argument("steps", nargs="*")
    args = parser.parse_args(argv)
    try:
        result = step_tails(args.pipe, args.steps, dict(os.environ), args.env_file, args.env0)
    except Exception as error:   # never the reason a status is not published
        result = {}
        print(f"step_tails: {type(error).__name__}", file=sys.stderr)
    if args.out:
        # a file, not an argument or an environment variable: one over 128 KiB cannot be passed to a program
        fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0), 0o600)
        with os.fdopen(fd, "w") as handle:
            json.dump(result, handle)
    else:
        json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
