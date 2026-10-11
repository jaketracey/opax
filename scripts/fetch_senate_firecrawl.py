"""Compatibility entry point for a bounded, date-aware Senate refresh.

Historical filename retained for compatibility. Uses direct honest HTTP only;
refused sources are paused, as in the daily pipeline.
Saved pages are parsed; nothing is loaded unless --db is passed explicitly.
"""
import sys
from parli.ingest.conduct_interests_federal import main

if __name__ == "__main__":
    sys.exit(main(["refresh", "--chamber", "senate", *sys.argv[1:]]))
