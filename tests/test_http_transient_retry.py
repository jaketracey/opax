"""A dropped connection or a timeout on a read is retried; a refusal and a write are not."""
from unittest import mock

import pytest
import requests

from parli.ingest import http


class Answer:
    status_code = 200
    headers = {}

    def close(self):
        pass


def session(monkeypatch, outcomes):
    calls = []

    def fake(self, method, url, **kwargs):
        calls.append(method)
        outcome = outcomes[len(calls) - 1]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(requests.Session, "request", fake)
    monkeypatch.setattr(http, "ensure_allowed", lambda url: None)
    monkeypatch.setattr(http, "pace", lambda url: None)
    monkeypatch.setattr(http.time, "sleep", lambda seconds: None)
    return http.Session(), calls


def test_a_timed_out_read_is_asked_again(monkeypatch):
    s, calls = session(monkeypatch, [requests.exceptions.ReadTimeout("slow"), requests.exceptions.ConnectionError("reset"), Answer()])
    assert s.request("GET", "https://data.gov.au/x").status_code == 200
    assert calls == ["GET"] * 3


def test_three_failures_raise_the_last_error(monkeypatch):
    s, calls = session(monkeypatch, [requests.exceptions.ReadTimeout("slow")] * 3)
    with pytest.raises(requests.exceptions.ReadTimeout):
        s.request("GET", "https://data.gov.au/x")
    assert len(calls) == 3


def test_a_write_is_never_repeated(monkeypatch):
    s, calls = session(monkeypatch, [requests.exceptions.ConnectionError("reset"), Answer()])
    with pytest.raises(requests.exceptions.ConnectionError):
        s.request("POST", "https://data.gov.au/x")
    assert calls == ["POST"]
