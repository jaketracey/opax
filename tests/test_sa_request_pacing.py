"""SA request pacing contracts, using only offline transports and temp state."""
from __future__ import annotations

import asyncio
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
from types import SimpleNamespace
import urllib.error
import urllib.request
import urllib.response

import pytest
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from parli.ingest import http


ROOT = Path(__file__).resolve().parents[1]
SA_HOST = "hansardsearch.parliament.sa.gov.au"
SA_URL = f"https://{SA_HOST}/offline-fixture"


class Clock:
    def __init__(self):
        self.now = 100.0
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, delay):
        assert delay >= 0
        self.sleeps.append(delay)
        self.now += delay


@pytest.fixture(autouse=True)
def isolated_policy(monkeypatch, tmp_path):
    monkeypatch.setenv("OPAX_SOURCE_STATUS_FILE", str(tmp_path / "access.json"))
    monkeypatch.delenv("OPAX_SOURCE_NAME", raising=False)
    monkeypatch.setattr(http, "_logged", set())
    monkeypatch.setattr(http, "_next_at", {})
    path = tmp_path / "coordination" / "sa.json"
    monkeypatch.setattr(http, "_SA_PACING_FILE", path)
    return path


@pytest.fixture(autouse=True)
def stub_urllib_validation_at_fake_transport_boundary(monkeypatch):
    validate = http._check_sa_opener

    def check(opener, url):
        # Handwritten test transports have no handlers or hidden retries.
        # Real OpenerDirector instances below always exercise production policy.
        if not isinstance(opener, Opener):
            return validate(opener, url)

    monkeypatch.setattr(http, "_check_sa_opener", check)


@pytest.fixture
def unpaused_sa(monkeypatch):
    """A hypothetical future permission change, confined to this test process."""
    monkeypatch.delitem(http.PAUSED_HOSTS, SA_HOST)


@pytest.fixture
def clock(monkeypatch):
    clock = Clock()
    monkeypatch.setattr(http.time, "monotonic", clock.monotonic)
    monkeypatch.setattr(http.time, "sleep", clock.sleep)
    return clock


def requests_wire(monkeypatch, statuses=(200,), headers=None):
    """Keep the stock no-retry adapter, but replace its final wire operation."""
    results = iter(statuses)
    attempts = []

    def send(adapter, request, **kwargs):
        attempts.append((request.url, time.monotonic()))
        response = requests.Response()
        response.status_code = next(results)
        response._content = b"offline fixture"
        response._content_consumed = True
        response.headers = requests.structures.CaseInsensitiveDict(headers or {})
        response.url, response.request = request.url, request
        return response

    monkeypatch.setattr(HTTPAdapter, "send", send)
    return attempts


class Opener:
    def __init__(self, statuses=(200,), headers=None):
        self.statuses = iter(statuses)
        self.headers = headers or {}
        self.attempts = []

    def open(self, request, **kwargs):
        self.attempts.append((request.full_url, time.monotonic()))
        status = next(self.statuses)
        if isinstance(status, BaseException):
            raise status
        if status != 200:
            raise urllib.error.HTTPError(
                request.full_url, status, "offline fixture", self.headers, io.BytesIO(b"")
            )
        return urllib.response.addinfourl(
            io.BytesIO(b"offline fixture"), self.headers, request.full_url, status
        )


def urllib_wire(monkeypatch):
    attempts = []

    def https_open(handler, request):
        attempts.append((request.full_url, time.monotonic()))
        response = urllib.response.addinfourl(io.BytesIO(b"offline fixture"), {}, request.full_url, 200)
        response.msg = "OK"
        return response

    monkeypatch.setattr(urllib.request.HTTPSHandler, "https_open", https_open)
    return attempts


def assert_spaced(attempts):
    starts = sorted(stamp for _, stamp in attempts)
    assert len(starts) >= 2
    assert all(later - earlier >= 1.0 for earlier, later in zip(starts, starts[1:])), starts


def test_mixed_sync_transports_share_one_second_gate(unpaused_sa, clock, monkeypatch):
    sent = requests_wire(monkeypatch, statuses=(200, 200))
    opener = Opener()
    with http.Session() as client:
        client.get(SA_URL)
        with http.open_url(opener, http.Request(SA_URL + "-urllib")) as response:
            assert response.read() == b"offline fixture"
        prepared = requests.Request("GET", SA_URL + "-prepared").prepare()
        client.send(prepared)
    attempts = sent + opener.attempts
    assert min(stamp for _, stamp in attempts) == 100.0
    assert_spaced(attempts)


@pytest.mark.parametrize("url", [
    SA_URL,
    "https://HANSARDSEARCH.PARLIAMENT.SA.GOV.AU/upper-case",
    f"http://{SA_HOST}:80/explicit-port",
])
def test_exact_sa_host_variants_are_paced(url, unpaused_sa, clock, monkeypatch):
    attempts = requests_wire(monkeypatch, statuses=(200, 200))
    with http.Session() as client:
        client.get(url)
        client.get(url)
    assert_spaced(attempts)


@pytest.mark.parametrize("transport", ["requests", "urllib"])
def test_throttle_retries_are_paced_and_keep_retry_after(
    transport, unpaused_sa, clock, monkeypatch
):
    headers = {"Retry-After": "2.5"}
    if transport == "requests":
        attempts = requests_wire(monkeypatch, statuses=(429, 503, 200), headers=headers)
        with http.Session() as client:
            assert client.get(SA_URL).status_code == 200
    else:
        opener = Opener(statuses=(429, 503, 200), headers=headers)
        with http.open_url(opener, http.Request(SA_URL)) as response:
            assert response.read() == b"offline fixture"
        attempts = opener.attempts
    assert len(attempts) == 3
    assert_spaced(attempts)
    assert all(b[1] - a[1] >= 2.5 for a, b in zip(attempts, attempts[1:]))


@pytest.mark.parametrize("status", [429, 503])
def test_retry_after_cooldown_is_shared_with_a_different_caller(
    status, unpaused_sa, clock, monkeypatch
):
    sent = requests_wire(monkeypatch, statuses=(status,), headers={"Retry-After": "8.25"})
    # send() returns the terminal response without request()'s own retry sleep.
    # The next caller must observe durable host cooldown, not depend on that sleep.
    with http.Session() as client:
        response = client.send(requests.Request("GET", SA_URL).prepare())
    assert response.status_code == status
    opener = Opener()
    http.open_url(opener, http.Request(SA_URL + "-peer")).close()
    assert opener.attempts[0][1] - sent[0][1] >= 8.25


def slow_requests_response_wire(monkeypatch, clock, status, *, fail_read=False):
    completions = []

    class SlowRaw:
        def stream(self, chunk_size, decode_content=True):
            clock.now += 3.0
            completions.append(clock.now)
            if fail_read:
                raise requests.exceptions.ChunkedEncodingError("offline body read failure")
            yield b"<html><title>Just a moment</title><body>Challenge</body></html>"

        def close(self):
            pass

        def release_conn(self):
            pass

    def send(adapter, request, **kwargs):
        response = requests.Response()
        response.status_code = status
        response.headers = requests.structures.CaseInsensitiveDict({"Retry-After": "8.25"})
        response.url, response.request = request.url, request
        response.raw = SlowRaw()
        return response

    monkeypatch.setattr(HTTPAdapter, "send", send)
    return completions


@pytest.mark.parametrize("status", [429, 503])
def test_challenge_response_persists_retry_after_before_body_validation(
    status, unpaused_sa, clock, monkeypatch
):
    completions = slow_requests_response_wire(monkeypatch, clock, status)
    with http.Session() as client:
        prepared = client.prepare_request(requests.Request("GET", SA_URL))
        original_list = prepared.hooks["response"]
        original_hooks = list(original_list)
        with pytest.raises(http.SourceRefused) as refusal:
            client.send(prepared)
        assert "challenge" in refusal.value.reason.lower()
        assert prepared.hooks["response"] is original_list
        assert prepared.hooks["response"] == original_hooks
    assert completions == [103.0]
    opener = Opener()
    http.open_url(opener, http.Request(SA_URL + "-peer")).close()
    assert opener.attempts[0][1] - completions[0] >= 8.25


def test_body_read_failure_persists_retry_after_and_restores_response_hooks(
    unpaused_sa, clock, monkeypatch
):
    completions = slow_requests_response_wire(monkeypatch, clock, 503, fail_read=True)
    with http.Session() as client:
        prepared = client.prepare_request(requests.Request("GET", SA_URL))
        original_list = prepared.hooks["response"]
        original_hooks = list(original_list)
        with pytest.raises(requests.exceptions.ChunkedEncodingError, match="offline body read failure"):
            client.send(prepared)
        assert prepared.hooks["response"] is original_list
        assert prepared.hooks["response"] == original_hooks
    assert completions == [103.0]
    opener = Opener()
    http.open_url(opener, http.Request(SA_URL + "-peer")).close()
    assert opener.attempts[0][1] - completions[0] >= 8.25


def test_ingestor_connection_retry_uses_same_gate(unpaused_sa, clock, monkeypatch):
    from parli.ingest import sa_hansard

    opener = Opener(statuses=(urllib.error.URLError("offline failure"), 200))
    monkeypatch.setattr(http, "build_opener", lambda: opener)
    assert sa_hansard._api_get(SA_URL) == b"offline fixture"
    assert_spaced(opener.attempts)


def test_failed_attempt_keeps_cooldown_for_next_transport(unpaused_sa, clock, monkeypatch):
    opener = Opener(statuses=(urllib.error.URLError("offline failure"),))
    with pytest.raises(urllib.error.URLError):
        http.open_url(opener, http.Request(SA_URL))
    sent = requests_wire(monkeypatch)
    http.get(SA_URL)
    assert_spaced(opener.attempts + sent)


def test_slow_response_body_finishes_before_next_transport_cooldown(
    unpaused_sa, clock, monkeypatch
):
    class SlowBody(io.BytesIO):
        def read(self, *args):
            clock.now += 3.0
            return super().read(*args)

    class SlowOpener(Opener):
        def open(self, request, **kwargs):
            self.attempts.append((request.full_url, time.monotonic()))
            return urllib.response.addinfourl(
                SlowBody(b"offline fixture"), {}, request.full_url, 200
            )

    opener = SlowOpener()
    assert http.open_url(opener, http.Request(SA_URL)).read() == b"offline fixture"
    sent = requests_wire(monkeypatch)
    http.get(SA_URL)
    assert sent[0][1] - opener.attempts[0][1] >= 4.0


@pytest.mark.parametrize("status", [429, 503])
def test_slow_http_error_body_finishes_before_shared_retry_after_cooldown(
    status, unpaused_sa, clock, monkeypatch
):
    bodies, completions = [], []

    class SlowBody(io.BytesIO):
        def read(self, *args):
            clock.now += 3.0
            completions.append(clock.now)
            return super().read(*args)

    class ErrorOpener(Opener):
        def open(self, request, **kwargs):
            self.attempts.append((request.full_url, time.monotonic()))
            body = SlowBody(b"upstream temporarily busy")
            bodies.append(body)
            raise urllib.error.HTTPError(
                request.full_url, status, "offline fixture", {"Retry-After": "2.5"}, body
            )

    opener = ErrorOpener()
    with pytest.raises(http.SourceRefused) as refusal:
        http.open_url(opener, http.Request(SA_URL))
    assert f"HTTP {status}" in refusal.value.reason
    assert len(opener.attempts) == len(completions) == 3
    assert all(body.closed for body in bodies)
    sent = requests_wire(monkeypatch)
    http.get(SA_URL + "-peer")
    next_starts = [stamp for _, stamp in opener.attempts[1:]] + [sent[0][1]]
    assert all(start - finished >= 2.5 for start, finished in zip(next_starts, completions))


def test_slow_503_challenge_body_refuses_and_closes_before_peer_cooldown(
    unpaused_sa, clock, monkeypatch
):
    class SlowChallenge(io.BytesIO):
        def read(self, *args):
            clock.now += 3.0
            return super().read(*args)

    body = SlowChallenge(b"<html><title>Just a moment</title><body>Challenge</body></html>")
    opener = Opener(statuses=(urllib.error.HTTPError(
        SA_URL, 503, "offline fixture", {"Content-Type": "text/html"}, body
    ),))
    with pytest.raises(http.SourceRefused) as refusal:
        http.open_url(opener, http.Request(SA_URL))
    assert "challenge" in refusal.value.reason.lower()
    assert len(opener.attempts) == 1
    assert body.closed
    assert clock.now == 103.0
    sent = requests_wire(monkeypatch)
    http.get(SA_URL + "-peer")
    assert sent[0][1] >= 104.0


@pytest.mark.parametrize("url", [
    "https://example.test/other-source",
    f"https://{SA_HOST}.example.test/lookalike",
])
def test_other_hosts_retain_existing_pacing_without_sa_state(
    url, clock, monkeypatch, isolated_policy
):
    attempts = requests_wire(monkeypatch, statuses=(200, 200))
    with http.Session() as client:
        client.get(url)
        client.get(url)
    assert attempts[1][1] - attempts[0][1] == pytest.approx(0.7)
    assert not isolated_policy.parent.exists()


def test_simultaneous_threads_share_sync_transport_gate(unpaused_sa, monkeypatch):
    sent = requests_wire(monkeypatch)
    opener = Opener()
    start = threading.Barrier(2)
    failures = []

    def fetch(kind):
        try:
            start.wait(timeout=5)
            if kind == "requests":
                with http.Session() as client:
                    client.get(SA_URL)
            else:
                http.open_url(opener, http.Request(SA_URL)).close()
        except BaseException as error:
            failures.append(error)

    threads = [threading.Thread(target=fetch, args=(kind,)) for kind in ("requests", "urllib")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=8)
    assert not any(thread.is_alive() for thread in threads)
    assert not failures
    assert_spaced(sent + opener.attempts)


PROCESS_FETCH = r"""
import io, json, socket, sys, time, urllib.response
from pathlib import Path
def forbidden(*args, **kwargs):
    raise AssertionError('child must never access the network')
socket.create_connection = forbidden
socket.socket.connect = forbidden
socket.socket.connect_ex = forbidden
import requests
from parli.ingest import http
http._SA_PACING_FILE = Path(sys.argv[1])
http.PAUSED_HOSTS.pop('hansardsearch.parliament.sa.gov.au')
# Test transport boundary only; the real opener policy has separate coverage.
http._check_sa_opener = lambda opener, url: None
url = 'https://hansardsearch.parliament.sa.gov.au/offline-process'
def record():
    print('ATTEMPT ' + json.dumps({'at':time.monotonic()}), flush=True)
def send(self, request, **kwargs):
    record()
    result = requests.Response()
    result.status_code, result._content = 200, b'offline'
    result._content_consumed = True
    result.headers = requests.structures.CaseInsensitiveDict()
    result.url, result.request = request.url, request
    return result
class Opener:
    def open(self, request, **kwargs):
        record()
        return urllib.response.addinfourl(io.BytesIO(b'offline'), {}, request.full_url, 200)
sys.stdin.readline()
if sys.argv[2] == 'requests':
    requests.adapters.HTTPAdapter.send = send
    http.get(url)
else:
    http.open_url(Opener(), http.Request(url)).close()
"""


def test_independent_processes_share_one_user_host_gate(isolated_policy, tmp_path):
    env = dict(os.environ, OPAX_SOURCE_STATUS_FILE=str(tmp_path / "child-access.json"))
    children = [subprocess.Popen(
        [sys.executable, "-c", PROCESS_FETCH, str(isolated_policy), kind],
        cwd=ROOT, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True,
    ) for kind in ("requests", "urllib")]
    try:
        for child in children:
            child.stdin.write("go\n")
            child.stdin.flush()
        attempts = []
        for child in children:
            stdout, stderr = child.communicate(timeout=12)
            assert child.returncode == 0, (stdout, stderr)
            attempts.extend(("child", json.loads(line.removeprefix("ATTEMPT "))["at"])
                            for line in stdout.splitlines() if line.startswith("ATTEMPT "))
        assert len(attempts) == 2
        assert_spaced(attempts)
    finally:
        for child in children:
            if child.poll() is None:
                child.kill()
            child.communicate()


@pytest.mark.parametrize("route", ["requests", "prepared", "urllib", "async", "ingestor"])
def test_sa_pause_precedes_coordination_and_network(route, monkeypatch, isolated_policy):
    def forbidden(*args, **kwargs):
        raise AssertionError("paused SA must not coordinate or send")

    monkeypatch.setattr(http, "_sa_attempt", forbidden)
    monkeypatch.setattr(http, "_check_sa_opener", forbidden)
    monkeypatch.setattr(HTTPAdapter, "send", forbidden)
    with pytest.raises(http.SourceRefused) as refusal:
        if route == "requests":
            http.get(SA_URL)
        elif route == "prepared":
            with http.Session() as client:
                client.send(requests.Request("GET", SA_URL).prepare())
        elif route == "urllib":
            http.open_url(SimpleNamespace(open=forbidden), http.Request(SA_URL))
        elif route == "ingestor":
            from parli.ingest import sa_hansard
            sa_hansard._api_get(SA_URL)
        else:
            pytest.importorskip("aiohttp")
            callback = http.aiohttp_trace().on_request_start[0]
            asyncio.run(callback(None, None, SimpleNamespace(url=SA_URL, headers={})))
    assert refusal.value.code == 4
    assert "HTTP 403 verified 2026-10-10" in refusal.value.reason
    assert not isolated_policy.parent.exists()


def test_sa_async_fails_closed_even_after_hypothetical_unpause(
    unpaused_sa, isolated_policy
):
    pytest.importorskip("aiohttp")
    callback = http.aiohttp_trace().on_request_start[0]
    with pytest.raises(http.SourceRefused) as refusal:
        asyncio.run(callback(None, None, SimpleNamespace(url=SA_URL, headers={})))
    assert "async" in refusal.value.reason.lower()
    assert not isolated_policy.parent.exists()


def test_direct_sa_gate_preserves_pause_before_coordination(isolated_policy):
    with pytest.raises(http.SourceRefused) as refusal:
        with http._sa_attempt(SA_URL):
            raise AssertionError("paused SA must never enter the attempt")
    assert "HTTP 403 verified 2026-10-10" in refusal.value.reason
    assert not isolated_policy.parent.exists()


def test_other_async_hosts_keep_identity_without_sa_coordination(isolated_policy):
    pytest.importorskip("aiohttp")
    params = SimpleNamespace(url="https://example.test/async", headers={})
    callback = http.aiohttp_trace().on_request_start[0]
    asyncio.run(callback(None, None, params))
    assert params.headers["User-Agent"] == http.USER_AGENT
    assert not isolated_policy.parent.exists()


class CustomAdapter(HTTPAdapter):
    """An adapter whose internal retry behavior is not trusted by the policy."""


@pytest.mark.parametrize("adapter", [
    HTTPAdapter(max_retries=Retry(total=1)),
    CustomAdapter(),
])
def test_sa_rejects_hidden_retries_or_custom_adapters(
    adapter, unpaused_sa, monkeypatch, isolated_policy
):
    attempts = requests_wire(monkeypatch)
    with http.Session() as client:
        client.mount("https://", adapter)
        with pytest.raises(http.SourceRefused):
            client.get(SA_URL)
    assert not attempts
    assert not isolated_policy.parent.exists()


def test_real_default_urllib_opener_is_supported_and_paced(unpaused_sa, clock, monkeypatch):
    attempts = urllib_wire(monkeypatch)
    opener = http.build_opener()
    for _ in range(2):
        with http.open_url(opener, http.Request(SA_URL)) as response:
            assert response.read() == b"offline fixture"
    assert_spaced(attempts)


@pytest.mark.parametrize("handler_type", [
    urllib.request.HTTPBasicAuthHandler,
    urllib.request.HTTPDigestAuthHandler,
])
def test_sa_urllib_auth_handlers_refused_before_coordination_or_wire(
    handler_type, unpaused_sa, monkeypatch, isolated_policy
):
    attempts = urllib_wire(monkeypatch)
    opener = http.build_opener(handler_type())
    with pytest.raises(http.SourceRefused):
        http.open_url(opener, http.Request(SA_URL))
    assert not attempts
    assert not isolated_policy.parent.exists()


@pytest.mark.parametrize("handler_type", [
    urllib.request.HTTPBasicAuthHandler,
    urllib.request.HTTPDigestAuthHandler,
])
def test_other_hosts_keep_existing_urllib_auth_handler_behavior(
    handler_type, clock, monkeypatch, isolated_policy
):
    attempts = urllib_wire(monkeypatch)
    with http.open_url(http.build_opener(handler_type()), http.Request("https://example.test/source")) as response:
        assert response.read() == b"offline fixture"
    assert len(attempts) == 1
    assert not isolated_policy.parent.exists()


def test_sa_prepared_digest_auth_hook_refused_before_coordination_or_wire(
    unpaused_sa, monkeypatch, isolated_policy
):
    attempts = requests_wire(monkeypatch)
    prepared = requests.Request(
        "GET", SA_URL, auth=requests.auth.HTTPDigestAuth("fixture-user", "fixture-password")
    ).prepare()
    assert prepared.hooks["response"]
    with http.Session() as client:
        with pytest.raises(http.SourceRefused):
            client.send(prepared)
    assert not attempts
    assert not isolated_policy.parent.exists()


def test_other_hosts_keep_existing_prepared_digest_auth_hook_behavior(
    monkeypatch, isolated_policy
):
    attempts = requests_wire(monkeypatch)
    prepared = requests.Request(
        "GET", "https://example.test/source",
        auth=requests.auth.HTTPDigestAuth("fixture-user", "fixture-password"),
    ).prepare()
    with http.Session() as client:
        assert client.send(prepared).status_code == 200
    assert len(attempts) == 1
    assert not isolated_policy.parent.exists()


@pytest.mark.parametrize("contents", ["", "{partial", '{"version":999}'])
def test_invalid_existing_coordination_state_fails_closed(
    contents, unpaused_sa, monkeypatch, isolated_policy
):
    isolated_policy.parent.mkdir()
    isolated_policy.write_text(contents)
    attempts = requests_wire(monkeypatch)
    with pytest.raises(http.SourceRefused):
        http.get(SA_URL)
    assert not attempts


def test_coordination_io_failure_never_sends(unpaused_sa, monkeypatch, isolated_policy):
    isolated_policy.mkdir(parents=True)  # A directory cannot be a coordination file.
    attempts = requests_wire(monkeypatch)
    with pytest.raises(http.SourceRefused):
        http.get(SA_URL)
    assert not attempts


@pytest.mark.parametrize("state,reason", [
    ({"version": 1, "pending": True, "observed_at": 100.0, "not_before": 101.0}, "pending"),
    ({"version": 1, "pending": False, "observed_at": 200.0, "not_before": 201.0}, "backwards"),
])
def test_interrupted_or_backwards_clock_state_requires_review(
    state, reason, unpaused_sa, clock, monkeypatch, isolated_policy
):
    isolated_policy.parent.mkdir()
    isolated_policy.write_text(json.dumps(state))
    attempts = requests_wire(monkeypatch)
    with pytest.raises(http.SourceRefused) as refusal:
        http.get(SA_URL)
    assert reason in refusal.value.reason
    assert not attempts
    assert json.loads(isolated_policy.read_text()) == state
