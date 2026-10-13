"""OpenAustralia's affiliation field includes offices, not just parties."""
import re

CHAIR_PARTIES = {
    'spk': 'Speaker', 'speaker': 'Speaker',
    'dspk': 'Deputy Speaker', 'deputy speaker': 'Deputy Speaker',
    'pres': 'President', 'president': 'President',
    'dpres': 'Deputy President', 'deputy president': 'Deputy President',
    'cwm': 'Chair', 'chair': 'Chair', 'chairman': 'Chair',
    'panel': 'Panel', "speaker's panel": 'Panel', 'panel of chairs': 'Panel',
    'temporary chair': 'Panel', 'temporary chairman': 'Panel',
    'acting speaker': 'Acting Speaker', 'acting president': 'Acting President',
}


def chair_role(party):
    return CHAIR_PARTIES.get(re.sub(r'\s+', ' ', party or '').strip().casefold())


def chair_party_sql(column='party'):
    return "LOWER(TRIM(COALESCE(" + column + ",''))) IN (" + ','.join(
        "'" + value.replace("'", "''") + "'" for value in CHAIR_PARTIES) + ')'
