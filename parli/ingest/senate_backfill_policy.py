"""Approved Senate repair. One off switch, plus the shared growth stop file."""
from . import backfill_guard

RUN_ID = 'senate-2014-2019-v1'
SPEND_HOLD = 'Senate backfill disabled: spend approval pending'


def enabled():
    return backfill_guard.enabled('senate')
