"""Source audit stub; deliberately never opens the input placeholders."""
import os
from pathlib import Path
import sys

with (Path(os.environ['HOME']) / 'evidence.calls').open('a') as f:
    f.write('audit\n')
sys.exit(1 if os.environ.get('EVIDENCE_TEST_MODE') == 'audit_fail' else 0)
