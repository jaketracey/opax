"""The VEC register parser, on an invented page in the register's shape."""
import pytest

from scripts import fetch_vec_parties as vec

ROW = '<tr><td><p><strong>{name}</strong></p>{body}<p><img alt="logo" src="/x.png" /></p></td><td>An Officer<br />Registered officer<br />1 Example Street</td></tr>'
PAGE = '<table><tr><th>Political party</th><th>Registered officer</th></tr>' + ''.join([
    ROW.format(name='Example Party &ndash; Victorian Division',
               body='<p>First registered: 26 March 1985\n<br />\n Re-registered: 3 October 2024</p><p>\n Abbreviated name: Example<br />\n Acronym: EXP</p>'),
    *[ROW.format(name=f'Invented Party {i}', body='<p>First registered: 7 October 2026</p>') for i in range(10)],
]) + '</table>'


def test_names_dates_and_abbreviations_only():
    parties = vec.parse(PAGE)
    assert len(parties) == 11
    assert parties[0] == {'name': 'Example Party – Victorian Division', 'first_registered': '1985-03-26',
                          're_registered': '2024-10-03', 'abbreviation': 'Example', 'acronym': 'EXP'}
    assert parties[1] == {'name': 'Invented Party 0', 'first_registered': '2026-10-07', 're_registered': None,
                          'abbreviation': None, 'acronym': None}
    assert 'Officer' not in str(parties) and 'Street' not in str(parties)


def test_a_changed_page_is_refused():
    with pytest.raises(SystemExit):
        vec.parse('<table><tr><td><p><strong>Only One Party</strong></p><p>First registered: 1 July 2020</p></td></tr></table>')
    with pytest.raises(SystemExit):
        vec.parse(PAGE.replace('First registered: 26 March 1985', 'Registered some time ago'))
