"""The NSW sitting-day listing for the current year must never come from the fetch cache."""

import json
from datetime import date

from parli.ingest import votes_state


def _listing(days):
    return json.dumps([{"date": d, "Events": [{"Chamber": "Legislative Assembly", "TocDocId": f"toc-{d}"}]}
                       for d in days]).encode()


def test_current_year_listing_is_fetched_fresh(monkeypatch, tmp_path):
    calls = []

    def fake_get(url, accept="*/*", delay=0.15, cache_key=None, retries=3):
        calls.append(cache_key)
        return _listing(["2026-09-17", "2026-10-15"])

    monkeypatch.setattr(votes_state, "_get", fake_get)
    days = votes_state.nsw_sitting_days(2026, today=date(2026, 10, 18))
    assert calls == [None]
    assert [d["date"] for d in days] == ["2026-09-17", "2026-10-15"]


def test_finished_year_listing_still_uses_the_cache(monkeypatch):
    calls = []

    def fake_get(url, accept="*/*", delay=0.15, cache_key=None, retries=3):
        calls.append(cache_key)
        return _listing(["2025-11-20"])

    monkeypatch.setattr(votes_state, "_get", fake_get)
    votes_state.nsw_sitting_days(2025, today=date(2026, 10, 18))
    assert calls == ["nsw/year_2025.json"]


def test_a_stale_cached_current_year_file_is_ignored(monkeypatch, tmp_path):
    monkeypatch.setattr(votes_state, "CACHE_DIR", tmp_path)
    stale = tmp_path / "nsw" / "year_2026.json"
    stale.parent.mkdir(parents=True)
    stale.write_bytes(_listing(["2026-09-17"]))

    def fake_urlopen(req, timeout=120):
        class R:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return _listing(["2026-09-17", "2026-10-13", "2026-10-15"])
        return R()

    monkeypatch.setattr(votes_state.source_http, "urlopen", fake_urlopen)
    monkeypatch.setattr(votes_state.time, "sleep", lambda s: None)
    days = votes_state.nsw_sitting_days(2026, today=date(2026, 10, 18))
    assert [d["date"] for d in days][-1] == "2026-10-15"
