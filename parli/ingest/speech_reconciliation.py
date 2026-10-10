"""Reconcile OpenAustralia XML to permanent speech citation IDs.

Older API/HTML imports did not store OA gids. Their chamber-days are complete
acquisitions with different speech boundaries: unmatched XML is evidence to
review, never permission to create more citation URLs on those days.
"""
from collections import Counter, defaultdict
import html
import re
import unicodedata

from scripts.roster_identity import federal_members, verify


def normalized_body(text):
    text = html.unescape(re.sub(r'<[^>]+>', '', text or ''))
    text = re.sub(r'\s+', ' ', unicodedata.normalize('NFC', text)).strip()
    return re.sub(r'(?:\s*View the PC OA website\.?)+$', '', text).strip()


class SpeechReconciler:
    def __init__(self, db):
        self.db = db
        self.members = federal_members(db)
        db.execute('CREATE INDEX IF NOT EXISTS idx_speeches_date_chamber ON speeches(date,chamber)')
        db.execute('''CREATE TABLE IF NOT EXISTS oa_speech_provenance (
            gid TEXT PRIMARY KEY, speech_id INTEGER NOT NULL REFERENCES speeches(speech_id))''')
        self.gid_column = next((r[1] for r in db.execute('PRAGMA table_info(speeches)')
                                if r[1] in ('gid', 'oa_gid')), None)

    def identity(self, speaker, pid, house, day):
        year = int(day[:4])
        row = {'name': speaker, 'states': ['federal'], 'chambers': [house],
               'first': year, 'last': year}
        candidates = Counter({str(pid): 1}) if pid is not None else Counter()
        resolved, _ = verify(row, candidates, self.members, {}, year)
        # An explicitly contradictory ID must not acquire the name's other owner.
        if pid is not None and resolved != str(pid):
            resolved = None
        identity = ('person', resolved) if resolved else ('unattributed', speaker or '')
        return resolved, identity

    def day(self, house, day):
        extra = f', {self.gid_column}' if self.gid_column else ''
        rows = self.db.execute(
            'SELECT speech_id,person_id,speaker_name,text,source' + extra +
            ' FROM speeches WHERE chamber=? AND date=?', (house, day)).fetchall()
        bodies, gids, identities = defaultdict(list), {}, {}
        for row in rows:
            _, identity = self.identity(row[2], row[1], house, day)
            identities[row[0]] = identity
            bodies[(identity, normalized_body(row[3]))].append(row[0])
            if self.gid_column and row[5]:
                gids[row[5]] = row[0]
        for gid, sid in self.db.execute(
                'SELECT p.gid,p.speech_id FROM oa_speech_provenance p JOIN speeches s '
                'ON s.speech_id=p.speech_id WHERE s.chamber=? AND s.date=?', (house, day)):
            gids[gid] = sid
        return rows, bodies, gids, identities

    def remember(self, gid, sid):
        if not gid:
            return
        previous = self.db.execute('SELECT speech_id FROM oa_speech_provenance WHERE gid=?', (gid,)).fetchone()
        if previous and previous[0] != sid:
            raise ValueError('OpenAustralia gid already belongs to another citation')
        self.db.execute('INSERT OR IGNORE INTO oa_speech_provenance VALUES (?,?)', (gid, sid))
