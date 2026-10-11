"""All Python tests must use offline transports/fixtures."""
import socket
import pytest


@pytest.fixture(autouse=True)
def no_real_network(monkeypatch):
    def refused(*args, **kwargs):
        raise AssertionError('Tests must stub the transport; real network requests are disabled')
    monkeypatch.setattr(socket, 'create_connection', refused)
    monkeypatch.setattr(socket.socket, 'connect', refused)
    monkeypatch.setattr(socket.socket, 'connect_ex', refused)
