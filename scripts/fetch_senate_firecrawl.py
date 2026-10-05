"""Compatibility entry point for a bounded, date-aware Senate refresh.

FIRECRAWL_API_KEY must be supplied in the environment. Uses the same approved
basic-proxy path, cache invalidation and credit cap as the daily pipeline.
Saved pages are parsed; nothing is loaded unless --db is passed explicitly.
"""
import sys
from parli.ingest.conduct_interests_federal import main

if __name__ == "__main__":
    sys.exit(main(["refresh", "--chamber", "senate", *sys.argv[1:]]))
