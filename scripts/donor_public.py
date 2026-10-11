"""Publish only donor-safe JSON through the shared JavaScript classifier.

The desktop database remains read only. Missing publication inputs fail closed
by refusing to write, rather than falling back to unfiltered JSON.
"""
import json
import os
from pathlib import Path
import subprocess


def public_donor_data(value):
    if os.environ.get('OPAX_DONOR_STAGE') == 'private':
        return value  # weekly_refresh writes this only to portal/private
    script = Path(__file__).resolve().with_name('withhold_donor_assets.mjs')
    result = subprocess.run([os.environ.get('OPAX_NODE', 'node'), str(script), '--stdin'],
                            input=json.dumps(value, ensure_ascii=False), text=True,
                            capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError('Donor privacy publication refused; verify export inputs')
    return json.loads(result.stdout)
