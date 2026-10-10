#!/usr/bin/env python3
"""Check fixture exporter imports without running their command-line entry points.

Run with python3 -I so PYTHONPATH, the real checkout and user site packages
cannot accidentally supply a dependency omitted from the fixture.
"""

import argparse
import ast
import os
from pathlib import Path
import runpy
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fixture", type=Path)
    parser.add_argument("exporters", nargs="+")
    args = parser.parse_args()
    if not sys.flags.isolated:
        parser.error("fixture import checks require Python's -I isolation flag")

    fixture = args.fixture.resolve()
    os.chdir(fixture)
    sys.path[:0] = [str(fixture / "scripts"), str(fixture)]
    for exporter in args.exporters:
        try:
            path = fixture / exporter
            namespace = runpy.run_path(str(path), run_name="__fixture_import_check__")
            # Imports inside functions matter too (e.g. bills' brief filler).
            # Execute only import statements, never the surrounding exporter.
            for node in ast.walk(ast.parse(path.read_text(), filename=str(path))):
                if isinstance(node, (ast.Import, ast.ImportFrom)):
                    statement = ast.Module(body=[node], type_ignores=[])
                    exec(compile(statement, str(path), "exec"), namespace)
        except ImportError as exc:
            print(f"FIXTURE IMPORT ERROR: {exporter}: {exc}. "
                  "Copy the missing dependency and its imports into the fixture, "
                  "or provide a compatible stub.", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
