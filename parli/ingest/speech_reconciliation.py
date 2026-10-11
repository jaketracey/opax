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

    def prepare(self, records, house, day):
        """Hold contradictory evidence before any record receives a citation.

        A supplied ID rejected by the guard is not an unattributed speech.
        Inspect the complete batch so changing record order cannot resolve an
        identity conflict by giving the first record a permanent citation.
        """
        prepared, groups = [], defaultdict(list)
        for record in records:
            if record.get('date', day) != day or record.get('chamber', house) != house:
                raise ValueError('speech record disagrees with its chamber-day file')
            pid, identity = self.identity(record.get('speaker') or '', record.get('person_id'), house, day)
            body = normalized_body(record.get('text', ''))
            item = {'record':record, 'pid':pid, 'identity':identity, 'body':body, 'reason':None}
            if record.get('person_id') is not None and pid is None:
                item['reason'] = 'rejected-person-id'
            prepared.append(item)
            groups[('body', body)].append(item)
            if record.get('gid'):
                groups[('gid', record['gid'])].append(item)
        for items in groups.values():
            if len({item['identity'] for item in items}) > 1:
                for item in items:
                    item['reason'] = 'batch-identity-conflict'
        for item in prepared:
            gid = item['record'].get('gid')
            if not gid or item['reason']:
                continue
            previous = self.db.execute(
                'SELECT s.speech_id,s.person_id,s.speaker_name,s.chamber,s.date '
                'FROM oa_speech_provenance p JOIN speeches s ON s.speech_id=p.speech_id WHERE p.gid=?',
                (gid,)).fetchall()
            if self.gid_column:
                previous += self.db.execute(
                    'SELECT speech_id,person_id,speaker_name,chamber,date FROM speeches '
                    f'WHERE {self.gid_column}=?', (gid,)).fetchall()
            if len({row[0] for row in previous}) > 1:
                item['reason'] = 'ambiguous-gid'
            for _, stored_pid, speaker, stored_house, stored_day in previous:
                _, stored_identity = self.identity(speaker, stored_pid, stored_house, stored_day)
                if (stored_house, stored_day) != (house, day):
                    item['reason'] = 'gid-chamber-day-conflict'
                elif stored_identity != item['identity']:
                    item['reason'] = 'gid-identity-conflict'
        return prepared

    def remember(self, gid, sid):
        if not gid:
            return
        previous = self.db.execute('SELECT speech_id FROM oa_speech_provenance WHERE gid=?', (gid,)).fetchone()
        if previous and previous[0] != sid:
            raise ValueError('OpenAustralia gid already belongs to another citation')
        self.db.execute('INSERT OR IGNORE INTO oa_speech_provenance VALUES (?,?)', (gid, sid))
