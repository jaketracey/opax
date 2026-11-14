#!/usr/bin/env python3
"""Keep the list of ChatGPT's server addresses used by the no-account MCP limits current.

    python3 scripts/refresh_mcp_egress.py           # report ranges OpenAI publishes that the Worker lacks
    python3 scripts/refresh_mcp_egress.py --write   # rewrite OPENAI_EGRESS in portal/src/mcp-shared-egress.ts

The daily refresh watchdog calls missing_ranges() and warns when the list has fallen behind.
A missing range is not a fault: requests from it get an ordinary address's ceiling, not the shared one.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
import sys
import urllib.request

SOURCE = 'https://openai.com/chatgpt-connectors.json'
FILE = Path(__file__).resolve().parents[1] / 'portal/src/mcp-shared-egress.ts'
BLOCK = re.compile(r"export const OPENAI_EGRESS = .*?\n(?=\S|\Z)", re.S)


def held(text):
    block = BLOCK.search(text)
    return set(re.findall(r'\d+\.\d+\.\d+\.\d+/\d+', block.group(0))) if block else set()


def published(payload):
    return {item['ipv4Prefix'] for item in payload.get('prefixes', []) if isinstance(item.get('ipv4Prefix'), str)}


def missing_ranges(payload, text):
    """Ranges OpenAI publishes that the Worker does not hold, sorted."""
    return sorted(published(payload) - held(text))


def render(payload):
    ranges = sorted(published(payload))
    lines = ["'" + ','.join(ranges[i:i + 8]) + (',' if i + 8 < len(ranges) else '') + "'" for i in range(0, len(ranges), 8)]
    return 'export const OPENAI_EGRESS = ' + ' +\n  '.join(lines) + '\n'


def fetch(agent='opax-watchdog'):
    request = urllib.request.Request(SOURCE, headers={'User-Agent': agent})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def main():
    payload, text = fetch(), FILE.read_text()
    missing = missing_ranges(payload, text)
    print(f"OpenAI publishes {len(published(payload))} ranges (creationTime {payload.get('creationTime')}); the Worker holds {len(held(text))}; {len(missing)} missing")
    if '--write' in sys.argv and missing:
        text = BLOCK.sub(lambda _: render(payload), text)
        text = re.sub(r'creationTime \d{4}-\d{2}-\d{2}', 'creationTime ' + str(payload.get('creationTime'))[:10], text)
        FILE.write_text(text)
        print('rewrote', FILE.name)
    return 0


if __name__ == '__main__':
    sys.exit(main())
