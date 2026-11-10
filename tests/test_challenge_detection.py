"""A challenge page is the challenge, not a content page carrying a bot-detection script."""
from parli.ingest.http import is_challenge

CONTENT_WITH_DETECTION_SCRIPTS = (
    b'<!DOCTYPE html><html><head><title>Ministers and Portfolios</title></head><body>'
    b'<h1>Ministers and portfolios</h1><ul><li><a href="/ministers-portfolios/premier.aspx">Premier</a></li></ul>'
    b'<script src="/_Incapsula_Resource?SWJIYLWA=719d34d31c8e3a6e6fffd425f7e032f3" async></script>'
    b'<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body></html>'
)
INCAPSULA_BLOCK_PAGE = (
    b'<html><head><META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW">'
    b'<script src="/_Incapsula_Resource?SWJIYLWA=719d34d31c8e3a6e6fffd425f7e032f3"></script></head>'
    b'<body><iframe id="main-iframe" src="/_Incapsula_Resource?SWUDNSAI=31&amp;xinfo=1-2-3" frameborder=0 '
    b'width="100%" height="100%"></iframe></body></html>'
)
CLOUDFLARE_CHALLENGE_FORM = (
    b'<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>'
    b'<form id="challenge-form" action="/?__cf_chl_f_tk=abc" method="POST"><input type="hidden" name="md"></form>'
    b'</body></html>'
)
CLOUDFLARE_CHALLENGE_IFRAME = (
    b'<html><head><title>Checking</title></head><body>'
    b'<iframe src="/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv/abc"></iframe></body></html>'
)


def test_detection_scripts_on_a_content_page_are_not_a_challenge():
    assert not is_challenge(CONTENT_WITH_DETECTION_SCRIPTS)


def test_challenge_iframes_forms_and_titles_are_challenges():
    assert is_challenge(INCAPSULA_BLOCK_PAGE)
    assert is_challenge(CLOUDFLARE_CHALLENGE_FORM)
    assert is_challenge(CLOUDFLARE_CHALLENGE_IFRAME)
    assert is_challenge(b'<html><head><title>Attention Required! | Cloudflare</title></head><body></body></html>')
    assert is_challenge(b'<html><body><div class="cf-chl-widget-k3x"></div></body></html>')


def test_structured_bodies_quoting_markers_are_never_a_challenge():
    assert not is_challenge(b'{"note": "challenge-form", "src": "/_Incapsula_Resource"}')
    assert not is_challenge(b'id,name\n1,"<iframe src=/_Incapsula_Resource>"\n')
