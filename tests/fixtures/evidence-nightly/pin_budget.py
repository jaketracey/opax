"""Pin a copied evidence guard's byte baseline to a fixture tree.

The real ceiling is the shipped public tree (about 164 MB) plus headroom. Fixture
repos hold a few KB, so their copy of the guard measures headroom from the
fixture tree instead, and the stub's 'budget' export still overshoots it.
"""
from pathlib import Path
import re
import sys


def pin(guard: Path, evidence: Path) -> int:
    size = sum(path.stat().st_size for path in Path(evidence).rglob('*') if path.is_file())
    source = Path(guard).read_text()
    pinned, count = re.subn(r'^SHIPPED_BYTES = [0-9_]+$', f'SHIPPED_BYTES = {size}', source, flags=re.M)
    if count != 1:
        raise SystemExit('pin_budget: SHIPPED_BYTES not found exactly once')
    Path(guard).write_text(pinned)
    return size


if __name__ == '__main__':
    pin(Path(sys.argv[1]), Path(sys.argv[2]))
