"""Readiness fault injection: operation names only, no database access."""
import os
from pathlib import Path
import time

calls = Path(os.environ['HOME']) / 'evidence-probe.calls'
with calls.open('a') as stream:
    stream.write('probe\n')
time.sleep(10)
with calls.open('a') as stream:
    stream.write('completed\n')
print('ready')
