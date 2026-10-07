#!/usr/bin/env python3
"""Sample a waiter's active elapsed time, excluding SIGSTOP and suspend gaps."""
import os
import subprocess
import sys
import time

pid, path = sys.argv[1:]


def state():
    row = subprocess.run(
        ['/bin/ps', '-o', 'lstart=,stat=', '-p', pid],
        capture_output=True, text=True, check=False,
    ).stdout.strip().rsplit(None, 1)
    return row if len(row) == 2 else ('', 'Z')


identity, previous = state()
last = time.monotonic()
elapsed = 0.0
while identity:
    time.sleep(0.25)
    current_identity, current = state()
    if current_identity != identity or current.startswith('Z'):
        break
    now = time.monotonic()
    delta = now - last
    # If this clock is stopped with the process tree, its next sample has a
    # gap. Charge at most one sample; never the suspension's wall-clock time.
    if not previous.startswith('T') and not current.startswith('T'):
        elapsed += min(delta, 0.25)
    last, previous = now, current
    with open(path + '.tmp', 'w') as output:
        output.write(str(int(elapsed)))
    os.replace(path + '.tmp', path)
