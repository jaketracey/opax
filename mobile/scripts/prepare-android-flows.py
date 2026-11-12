#!/usr/bin/env python3
"""Prepare Android journeys with the repository's locked YAML parser.

No shared iOS flow is modified. Node/yaml come from mobile's npm ci.
"""
from pathlib import Path
import subprocess
import sys

if __name__ == '__main__':
    raise SystemExit(subprocess.call(['node', str(Path(__file__).with_suffix('.mjs')), *sys.argv[1:]]))
