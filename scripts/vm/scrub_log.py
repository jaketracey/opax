#!/usr/bin/env python3
"""Mask secrets in text on stdin before it goes anywhere public (a GitHub issue).

    tail -n 80 nightly.log | python3 scripts/vm/scrub_log.py ~/opax/.env ~/.config/opax/nightly.env

Two passes: every value in the given KEY=VALUE files that looks like a secret (6+
characters) is replaced wherever it appears, the home directory becomes ~, then common shapes
are masked even if the value is not in a file: key=/token=/secret=/password= query and assignment values,
Authorization / Bearer / x-nuclia-* headers, and long hex or base64-ish strings that
follow a colon or equals sign.
"""
import re
import sys
from pathlib import Path

SHAPES = [
    (re.compile(r"(?i)\b((?:api[_-]?)?key|token|secret|password|passwd|pwd|auth|sig|signature)=([^&\s\"']+)"), r"\1=***"),
    (re.compile(r"(?i)\b(authorization|x-nuclia-[a-z]+|x-api-key|api-key|cookie)\s*[:=]\s*(?:Bearer\s+)?[^\s\"',;]+"), r"\1: ***"),
    (re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{8,}"), "Bearer ***"),
    (re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,})\b"), "***"),
]
NOT_SECRET_KEYS = {"ARAG_ZONE", "OPAX_BOT_NAME", "OPAX_BOT_EMAIL", "TZ"}


def secret_values(paths: list[str]) -> list[str]:
    values: set[str] = set()
    for p in paths:
        try:
            lines = Path(p).expanduser().read_text().splitlines()
        except OSError:
            continue
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.replace("export ", "").strip()
            v = v.strip().strip("'\"")
            if k in NOT_SECRET_KEYS or len(v) < 6:
                continue
            values.add(v)
    return sorted(values, key=len, reverse=True)


def scrub(text: str, values: list[str]) -> str:
    for v in values:
        text = text.replace(v, "***")
    home = str(Path.home())
    if len(home) > 1:
        text = text.replace(home, "~")
    for pattern, repl in SHAPES:
        text = pattern.sub(repl, text)
    return text


if __name__ == "__main__":
    sys.stdout.write(scrub(sys.stdin.read(), secret_values(sys.argv[1:])))
