# parli.analysis — Analytical modules
# Each module is a standalone script that reads from the DB,
# computes results, and writes back to analysis_cache / updates columns.
#
# Modules:
#   consistency  — Speech-vote consistency ("hypocrisy tracker")
#   disconnect   — Speech-vote disconnect scoring engine (core OPAX metric)
#   bias         — Media bias analysis
#   factions     — Party faction detection
#   prediction   — Vote prediction
#   sentiment    — Speech sentiment analysis
#   topics       — Topic classification
#   topic_insights — Per-topic data insight generation (stats, quotes, money, trends)
#   conflicts    — Conflict of interest detector (interests vs votes)
#   stories      — Cross-cutting narrative discovery engine
#   pork_barrel  — Pork-barreling detection (electoral margins vs grant spending)
#   data_hygiene — Deduplication and normalization across all tables
#   normalize_parties — Canonical party name mapping across members/speeches/donations
#   enrich_members   — Fill null fields in members table from speeches/heuristics
#   fix_entity_merges — Detect and split false merges in entity resolution
