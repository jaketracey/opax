"""The Senate repair remains held until its spend is approved and enabled."""
import os

RUN_ID = 'senate-2014-2019-v1'
SPEND_HOLD = 'Senate backfill disabled: spend approval pending'


def enabled():
    return os.environ.get('OPAX_SENATE_BACKFILL', '0') == '1'
