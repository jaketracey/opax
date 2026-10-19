"""Exact pre-optimization oracles; performance work must not alter evidence."""
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import random
import re
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_evidence_layers as layers
import passage_text as passage

FIXTURE = json.loads((ROOT / 'tests/fixtures/passage-text.json').read_text())
LEGACY_NAMES = re.compile(
    '(?=[' + re.escape(passage._FIRST) + '])' + r'(?P<name>(?P<full>'
    + '|'.join(re.escape(value) for value in passage._ROSTER['full_names']) + r')|(?:'
    + '|'.join(re.escape(value) for value in passage._ROSTER['honorifics']) + r') (?:'
    + '|'.join(re.escape(value) for value in passage._ROSTER['surnames']) + r'))(?P<function>'
    + '|'.join(re.escape(value) for value in passage._ROSTER['function_words']) + r')?'
)
LEGACY_INTERJECTION = re.compile(
    r'(?<!\w)([^\W\d_]+?)(interjecting|interjections|interjection)(?!\w)', re.I)


def legacy_word(char):
    return bool(char) and (char.isalnum() or char == '_' or unicodedata.category(char).startswith('M'))


def legacy_repair(text):
    """Frozen callback logic and flat regexes, without optimized gates."""
    counts = dict(interjection=0, before_name=0, after_name=0)

    def marker(match):
        before = text[match.start()-1] if match.start() else ''
        after = text[match.end():match.end()+1]
        if not match[1].isalpha() or legacy_word(before) or legacy_word(after):
            return match[0]
        counts['interjection'] += 1
        return match[1] + ' ' + match[2]

    text = LEGACY_INTERJECTION.sub(marker, text)

    def name(match):
        before = text[match.start()-1] if match.start() else ''
        after = text[match.end():match.end()+1]
        if legacy_word(after):
            return match[0]
        if match['function'] and (match['name'].split(' ')[-1] + match['function']).lower() in passage._NAME_TOKENS:
            return match[0]
        prefix = bool(match['full']) and 'a' <= before <= 'z'
        suffix = bool(match['function']) and bool(match['full'] or match['name'].startswith('Senator ')) and (prefix or not legacy_word(before))
        counts['before_name'] += int(prefix)
        counts['after_name'] += int(suffix)
        return (' ' if prefix else '') + match['name'] + (' ' if suffix else '') + (match['function'] or '')

    return LEGACY_NAMES.sub(name, text), counts


def legacy_normalize(value):
    # Markup/entity primitives are unchanged by this patch. The oracle never
    # calls optimized normalization, join repair, windows, or prepared caches.
    text = passage._ENTITY.sub(passage._decode_entity, passage._strip_markup(value or ''))
    text = re.sub(r'(?<=\w)\x00+(?=\w)', ' ', text).replace('\x00', '')
    text, _ = legacy_repair(text)
    text = passage._HORIZONTAL.sub(' ', text)
    text = re.sub(r' *\n *', '\n', text)
    return re.sub(r'\n{3,}', '\n\n', text).strip(passage._WHITESPACE)


def legacy_window(text, limit=600, start=0, end=None):
    """Frozen original UTF-16 window, including lone surrogate semantics."""
    if limit <= 0:
        return ''
    data = text.encode('utf-16-le', 'surrogatepass')
    length = len(data) // 2
    char = lambda at: chr(data[2 * at] | data[2 * at + 1] << 8)
    take = lambda a, b=length: data[2*a:2*b].decode('utf-16-le', 'surrogatepass')
    start = min(length, max(0, start))
    end = min(length, max(0, end if end is not None else length))
    while start > 0 and char(start - 1) not in passage._WHITESPACE:
        start -= 1
    while start < length and char(start) in passage._WHITESPACE:
        start += 1
    prefix = '… ' if take(0, start).strip(passage._WHITESPACE) else ''
    stop = min(length, end, start + max(0, limit - len(prefix)))
    suffix = ' …' if take(stop).strip(passage._WHITESPACE) else ''
    stop = min(stop, start + max(0, limit - len(prefix) - len(suffix)))
    while stop > start and stop < length and char(stop) not in passage._WHITESPACE and char(stop - 1) not in passage._WHITESPACE:
        stop -= 1
    body = take(start, stop).strip(passage._WHITESPACE)
    return (prefix + body + suffix).strip(passage._WHITESPACE) if body else ('…' if text.strip(passage._WHITESPACE) else '')


def legacy_excerpt(body, start, end):
    left = len(legacy_normalize(body[:start]).encode('utf-16-le', 'surrogatepass')) // 2
    right = len(legacy_normalize(body[:end]).encode('utf-16-le', 'surrogatepass')) // 2
    return legacy_window(legacy_normalize(body), start=max(0, left - 160), end=right + 160)


class LegacyMatcher:
    """Frozen original matcher, including ambiguity filtering and scan order."""
    def __init__(self, aliases):
        self.trie = {}
        for alias, targets in aliases.items():
            if len(targets) != 1 or len(alias) < 2 or ' '.join(alias) in layers.GENERIC:
                continue
            node = self.trie
            for part in alias:
                node = node.setdefault(part, {})
            node[None] = next(iter(targets))

    def matches(self, text):
        words = list(layers.WORD.finditer(text))
        for i, word in enumerate(words):
            node = self.trie
            best = None
            for j in range(i, min(i + 30, len(words))):
                if j > i and re.search(r'[.!?;\n]', text[words[j-1].end():words[j].start()]):
                    break
                node = node.get(words[j].group().casefold())
                if node is None:
                    break
                if None in node:
                    best = (node[None], word.start(), words[j].end())
            if best:
                yield best


def legacy_scan(source, out, matcher, limit=0):
    """Frozen original primary scan, including original hash/ID/SQL inputs."""
    aliases = defaultdict(set)
    for row in source.execute('SELECT DISTINCT electorate_name,state FROM postcode_electorates'):
        name, state = row['electorate_name'], row['state'].casefold()
        obj = 'electorate:'+state+':'+name.casefold()
        out.execute('INSERT OR IGNORE INTO entities VALUES (?,?,?,NULL)', (obj, 'electorate', name))
        for prefix in ['electorate of ', 'seat of ', 'division of ']:
            aliases[layers.tokens(prefix+name)].add(obj)
    out.commit()
    places = LegacyMatcher(aliases)
    for table, idcol, textcol in [('ext_press_releases', 'source_id', 'body_text'), ('speeches', 'speech_id', 'text_clean')]:
        progress = out.execute('SELECT last_rowid,processed FROM progress WHERE source_table=?', (table,)).fetchone()
        last, count = progress or (0, 0)
        done = 0
        for row in source.execute('SELECT rowid AS _rowid,* FROM '+table+' WHERE rowid > ? ORDER BY rowid', (last,)):
            record = dict(row)
            sid = str(record[idcol])
            text = record.get(textcol) or record.get('text') or ''
            if table == 'ext_press_releases':
                sid = str(record['source'])+':'+sid
            subject = table+':'+sid
            for entity, start, end in places.matches(text):
                layers.add_evidence(out, subject, 'mentions_electorate', entity, table, sid, text[start:end],
                    'explicit_electorate_phrase', 0.98, url=record.get('url'), start=start, end=end,
                    details={'excerpt': legacy_excerpt(text, start, end), 'date': record.get('date')})
            for entity, start, end in matcher.matches(text):
                layers.add_evidence(out, subject, 'mentions', entity, table, sid, text[start:end],
                    'unique_exact_alias', 0.98, url=record.get('url'), start=start, end=end,
                    details={'excerpt': legacy_excerpt(text, start, end), 'date': record.get('date'),
                             'text_field': textcol if record.get(textcol) else 'text',
                             'text_sha256': hashlib.sha256(text.encode()).hexdigest()})
            if table == 'speeches' and record.get('electorate'):
                electorate = record['electorate'].strip()
                obj = 'electorate:'+str(record.get('state') or 'unknown').casefold()+':'+electorate.casefold()
                out.execute('INSERT OR IGNORE INTO entities VALUES (?,?,?,NULL)', (obj, 'electorate', electorate))
                layers.add_evidence(out, subject, 'speaker_represents', obj, table, sid, electorate,
                    'source_electorate_field', 1.0, details={'date': record.get('date'), 'person_id': record.get('person_id')})
            count += 1
            done += 1
            last = record['_rowid']
            if done % 500 == 0:
                out.execute('INSERT OR REPLACE INTO progress VALUES (?,?,?)', (table, last, count))
                out.commit()
            if limit and done >= limit:
                break
        out.execute('INSERT OR REPLACE INTO progress VALUES (?,?,?)', (table, last, count))
        out.commit()


def snapshot(db):
    return {name: [tuple(row) for row in db.execute('SELECT * FROM '+name+' ORDER BY 1')]
            for name in ['evidence', 'entities', 'progress']}


def source_fixture(path):
    source = sqlite3.connect(path)
    source.executescript('''
        CREATE TABLE postcode_electorates(electorate_name,state);
        INSERT INTO postcode_electorates VALUES ('Example','NSW');
        CREATE TABLE speeches(speech_id INTEGER PRIMARY KEY,text_clean,text,electorate,state,date,url,person_id);
        CREATE TABLE ext_press_releases(source,source_id,body_text,text,date,url);
    ''')
    source.execute('INSERT INTO ext_press_releases VALUES (?,?,?,?,?,?)', (
        'official', 'press-1', '<p>Acme Holdings in the electorate of Example.</p> Helpful Funding Programme.',
        None, '2026-10-19', 'https://example.test/press-1'))
    for row in FIXTURE['speeches']:
        source.execute('INSERT INTO speeches VALUES (?,?,?,?,?,?,?,?)', (
            row['speech_id'], row['text_clean'], 'Unselected fallback Acme Holdings.',
            'Example', 'NSW', '2026-10-18', 'https://example.test/'+str(row['speech_id']), 'person:1'))
    source.execute('INSERT INTO speeches VALUES (?,?,?,?,?,?,?,?)', (
        2, '', 'Acme Holdings in the division of Example. Acme Holdings again.',
        None, None, '2026-10-17', 'https://example.test/2', None))
    source.commit()
    source.close()


class PreparedPassageTests(unittest.TestCase):
    def test_factored_literals_preserve_longest_first_empty_and_duplicates(self):
        for values in [[], [''], ['Ann Marie', 'Ann', 'Ann', ''], ['Mrs', 'Mr', 'Ms'], ['a.b', 'a+b', 'a', '']]:
            flat = re.compile('|'.join(re.escape(value) for value in values))
            factored = re.compile(passage._alternatives(values))
            for text in ['Ann Marie Ann Annabelle Mrs Mr Ms', 'a.b a+b a', '', 'unmatched']:
                self.assertEqual([(match.span(), match[0]) for match in flat.finditer(text)],
                                 [(match.span(), match[0]) for match in factored.finditer(text)])

    def test_all_roster_functions_preserve_matches_text_and_repair_counts(self):
        cases = ['Plain ordinary text.', 'T\u0130nterjecting T\u0131nterjection Tinterjections!',
                 '<p>markup &amp; &#233;</p>', 'surrogate\ud800 and astral\U0001f600']
        for name in passage._ROSTER['full_names']:
            for function in passage._ROSTER['function_words']:
                cases.extend(('prefix'+name+function+'!', name+function+'!', name+function+'\u0301'))
        for name in passage._ROSTER['surnames']:
            cases.extend(('Senator '+name+'was!', 'prefixSenator '+name+'and!', 'Mr '+name+'was!'))
        rng = random.Random(20261019)
        names = passage._ROSTER['full_names']
        cases.extend(rng.choice(names)+rng.choice(['was', 'and', '!', ''])+' '+rng.choice(names)
                     for _ in range(1000))
        for body in cases:
            self.assertEqual([(m.span(), m.groupdict()) for m in LEGACY_NAMES.finditer(body)],
                             [(m.span(), m.groupdict()) for m in passage._NAMES.finditer(body)])
            self.assertEqual(legacy_repair(body), passage.repair_passage_joins(body), repr(body))
            self.assertEqual(legacy_normalize(body), passage.normalize_passage(body), repr(body))

    def test_prepared_excerpt_matches_frozen_prefix_and_utf16_boundaries(self):
        bodies = [case['input'] for case in FIXTURE['cases']]
        bodies += [row['text_clean'] for row in FIXTURE['speeches']]
        bodies += ['<p>Open <strong>and incomplete &amp; text',
                   'Lone\ud800surrogate and \U0001f600 word',
                   'prefix'+passage._ROSTER['full_names'][0]+'was speaking.',
                   'T\u0130nterjecting <b> joined </b> &amp;']
        for body in bodies:
            prepared = passage.PreparedEvidenceText(body)
            positions = [-1, 0, 1, len(body)//2, len(body), len(body)+4]
            # Also cut inside every entity/markup marker, where normalizing a
            # full body and slicing its result would produce different output.
            positions += [at+1 for at, char in enumerate(body) if char in '<&']
            for start in positions:
                for end in positions:
                    self.assertEqual(legacy_excerpt(body, start, end), prepared.excerpt(start, end))
            self.assertEqual(legacy_excerpt(body, 1, len(body)), passage.evidence_excerpt(body, 1, len(body)))

    def test_preparation_is_lazy_isolated_and_prefix_memo_is_bounded(self):
        first = passage.PreparedEvidenceText('First body and ending.')
        second = passage.PreparedEvidenceText('Second body with another ending.')
        self.assertIsNone(first._normalized)
        with patch.object(passage, 'normalize_passage', wraps=passage.normalize_passage) as normalize:
            one = first.excerpt(1, 5)
            self.assertEqual(normalize.call_count, 3)
            self.assertEqual(first.excerpt(1, 5), one)
            self.assertEqual(normalize.call_count, 3)
            self.assertEqual(second.excerpt(1, 5), legacy_excerpt(second.body, 1, 5))
            self.assertEqual(normalize.call_count, 6)
            self.assertEqual(first.excerpt(1, 5), one)
        with self.assertRaises(AttributeError):
            first.body = second.body
        self.assertIsNot(first._prefix_lengths, second._prefix_lengths)
        body = 'ordinary words ' * 100
        prepared = passage.PreparedEvidenceText(body)
        for position in range(prepared._MAX_PREFIXES + 20):
            prepared.excerpt(position, position + 1)
        self.assertLessEqual(len(prepared._prefix_lengths), prepared._MAX_PREFIXES)
        self.assertEqual(prepared.excerpt(len(body), len(body)+1),
                         legacy_excerpt(body, len(body), len(body)+1))

    def test_public_window_keeps_legacy_limits(self):
        for text in ['', 'word '*200, 'Lone\ud800 \U0001f600 word']:
            for limit in [-1, 0, 1, 10, 600]:
                for start, end in [(-1, 9999), (0, None), (1, 4)]:
                    self.assertEqual(legacy_window(text, limit, start, end),
                                     passage.passage_window(text, limit, start, end))


class PreparedMatcherTests(unittest.TestCase):
    def test_frozen_matcher_boundaries_ambiguity_and_falsey_values(self):
        aliases = {
            ('alpha', 'beta'): {'ab'}, ('alpha', 'beta', 'gamma'): {'abc'},
            ('beta', 'gamma'): {'bg'}, ('ambiguous', 'alias'): {'one', 'two'},
            ('health',): {'single'}, ('australian', 'government'): {'generic'},
            ('strasse', 'trust'): {'sharp-s'}, ('i\u0307', 'trust'): {'dotted-i'},
            ('cafe', 'trust'): {'combining'}, ('empty', 'target'): {''},
            ('false', 'target'): {False}, ('none', 'target'): {None},
            ('nobody', 'target'): set(), ('', 'unmatchable'): {'empty-token'},
            tuple('w'+str(i) for i in range(30)): {'thirty'},
            tuple('w'+str(i) for i in range(31)): {'thirty-one'},
        }
        texts = ['', 'alpha beta gamma', 'alpha beta alpha beta gamma',
                 'ambiguous alias australian government health',
                 'Straße trust Iİ trust İ trust cafe\u0301 trust',
                 'empty target false target none target nobody target',
                 '😀 alpha beta gamma\ud800', ' '.join('w'+str(i) for i in range(35))]
        texts += ['alpha'+gap+'beta gamma' for gap in ['.', '!', '?', ';', '\n', '\r', '\t', ' ', '-', ',', '\u0301', '_']]
        old, new = LegacyMatcher(aliases), layers.Matcher(aliases)
        for body in texts:
            expected = list(old.matches(body))
            prepared = layers.PreparedMatchText(body)
            self.assertEqual(list(new.matches(body)), expected)
            self.assertEqual(list(new.matches(body, prepared)), expected)
            self.assertEqual(list(new.matches(body, prepared)), expected)
            self.assertIsInstance(prepared.words, tuple)
            self.assertTrue(all(isinstance(word, tuple) for word in prepared.words))
            self.assertLessEqual(len(prepared._breaks), len(prepared.words))
        for value in [None, 0, False]:
            with self.assertRaises(TypeError):
                list(old.matches(value))
            with self.assertRaises(TypeError):
                list(new.matches(value))

    def test_shared_tokens_are_bound_to_original_body_and_not_mutable(self):
        text = 'Alpha beta.'
        prepared = layers.PreparedMatchText(text)
        matcher = layers.Matcher({('alpha', 'beta'): {'ab'}})
        self.assertEqual(list(matcher.matches(text, prepared)), [('ab', 0, 10)])
        with self.assertRaises(ValueError):
            list(matcher.matches('Different body.', prepared))
        with self.assertRaises(AttributeError):
            prepared.text = 'Different body.'
        with self.assertRaises(AttributeError):
            prepared.words = ()
        with self.assertRaises(TypeError):
            prepared.words[0][0] = 'different'

    def test_real_fixture_rows_match_legacy_offsets_and_order(self):
        names = ['Cattle Australia', 'Yandina State School', 'Meat & Livestock',
                 'Transport Legislation Committee']
        aliases = {layers.tokens(name): {name} for name in names}
        old, new = LegacyMatcher(aliases), layers.Matcher(aliases)
        for row in FIXTURE['speeches']:
            text = row['text_clean']
            prepared = layers.PreparedMatchText(text)
            self.assertEqual(list(new.matches(text, prepared)), list(old.matches(text)))


class EvidenceScanParityTests(unittest.TestCase):
    def test_complete_and_resumed_scan_preserve_all_rows_and_source_bytes(self):
        aliases = {layers.tokens(name): {name} for name in [
            'Cattle Australia', 'Yandina State School', 'Acme Holdings',
            'Meat & Livestock', 'Transport Legislation Committee']}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            source_fixture(path/'source.sqlite')
            before = (path/'source.sqlite').read_bytes()
            source = sqlite3.connect((path/'source.sqlite').as_uri()+'?mode=ro', uri=True)
            source.row_factory = sqlite3.Row
            source.execute('PRAGMA query_only=ON')
            for limit in [0, 1]:
                old = layers.setup(path/f'old-{limit}.sqlite')
                new = layers.setup(path/f'new-{limit}.sqlite')
                for _ in range(5):
                    legacy_scan(source, old, LegacyMatcher(aliases), limit)
                    layers.scan(source, new, layers.Matcher(aliases), limit)
                    self.assertEqual(snapshot(old), snapshot(new))
                # IDs, quotes, raw offsets, SHA256, URLs, details JSON and
                # coverage progress are all included in the row comparison.
                self.assertGreater(new.execute('SELECT count(*) FROM evidence').fetchone()[0], 0)
                old.close()
                new.close()
            source.close()
            self.assertEqual((path/'source.sqlite').read_bytes(), before)

    def test_additional_mentions_keep_original_excerpt_hash_and_coordinates(self):
        import build_additional_mentions as additional
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            source_fixture(path/'source.sqlite')
            base = layers.setup(path/'base.sqlite')
            base.executemany('INSERT INTO entities VALUES (?,?,?,NULL)', [
                ('one', 'supplier', 'Acme Holdings'), ('two', 'supplier', 'Acme Holdings'),
                ('canonical', 'supplier', 'Acme Holdings')])
            base.executemany('INSERT INTO aliases VALUES (?,?)', [('acme holdings', 'one'), ('acme holdings', 'two')])
            base.commit()
            base.close()
            places = layers.setup(path/'places.sqlite')
            places.execute("INSERT INTO entities VALUES ('program:1','program','Helpful Funding Programme',NULL)")
            places.commit()
            places.close()
            decisions = sqlite3.connect(path/'decisions.sqlite')
            decisions.execute('CREATE TABLE decisions(subject,object,status)')
            decisions.executemany('INSERT INTO decisions VALUES (?,?,?)', [
                ('one', 'canonical', 'accepted'), ('two', 'canonical', 'accepted')])
            decisions.commit()
            decisions.close()
            inputs = [path/name for name in ['source.sqlite', 'base.sqlite', 'decisions.sqlite', 'places.sqlite']]
            before = [filename.read_bytes() for filename in inputs]
            opened = []
            original_connect = additional.connect

            def connect(filename):
                connection = original_connect(filename)
                opened.append(connection)
                return connection

            def setup(filename):
                connection = layers.setup(filename)
                opened.append(connection)
                return connection

            try:
                with patch.object(additional, 'connect', side_effect=connect), patch.object(additional, 'setup', side_effect=setup):
                    additional.build(*inputs, path/'additional.sqlite')
            finally:
                for connection in opened:
                    connection.close()
            out = sqlite3.connect(path/'additional.sqlite')
            source = sqlite3.connect(path/'source.sqlite')
            source.row_factory = sqlite3.Row
            expected = layers.setup(path/'expected.sqlite')
            matcher = LegacyMatcher({('acme', 'holdings'): {'canonical'},
                                     ('helpful', 'funding', 'programme'): {'program:1'}})
            for table, column, idcol in [('ext_press_releases', 'body_text', 'source_id'), ('speeches', 'text_clean', 'speech_id')]:
                for row in source.execute('SELECT * FROM '+table):
                    row = dict(row)
                    body = row.get(column) or row.get('text') or ''
                    sid = str(row[idcol])
                    if table == 'ext_press_releases':
                        sid = str(row['source'])+':'+sid
                    for entity, start, end in matcher.matches(body):
                        layers.add_evidence(expected, table+':'+sid, 'mentions', entity, table, sid, body[start:end],
                            'resolved_exact_alias', .98, url=row.get('url'), start=start, end=end,
                            details={'excerpt': legacy_excerpt(body, start, end), 'date': row.get('date'),
                                     'text_field': column if row.get(column) else 'text',
                                     'text_sha256': hashlib.sha256(body.encode()).hexdigest()})
            expected_rows = [tuple(row) for row in expected.execute('SELECT * FROM evidence ORDER BY id')]
            actual_rows = out.execute('SELECT * FROM evidence ORDER BY id').fetchall()
            self.assertGreater(len(actual_rows), 0)
            self.assertEqual(actual_rows, expected_rows)
            source.close()
            out.close()
            expected.close()
            self.assertEqual([filename.read_bytes() for filename in inputs], before)


if __name__ == '__main__':
    unittest.main()
