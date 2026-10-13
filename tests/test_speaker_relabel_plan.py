from copy import deepcopy

import pytest

from scripts import speaker_relabel_plan as R


def resource():
    return {'id': 'fixture-rid', 'slug': 'speech-1', 'title': 'Alex Invented — Housing',
        'summary': 'Preserved summary', 'texts': {'body': {'body': 'Preserved mixed text'}},
        'origin': {'collaborators': ['Alex Invented'], 'tags': ['preserved']},
        'extra': {'metadata': {'person_id': 'wrong-legacy-id', 'speaker_raw': 'Alex Invented', 'date': '2026-10-13'}},
        'usermetadata': {'classifications': [
            {'labelset': 'topic', 'label': 'housing', 'cancelled_by_user': False},
            {'labelset': 'party', 'label': 'Fictional Party'},
            {'labelset': 'speaker_type', 'label': 'member'}], 'relations': ['preserved']}}


def turns():
    return [
        {'gid': 'g1', 'person_id': '1', 'name': 'Alex Invented', 'office_id': 'office1',
         'speaker_type': 'member', 'chair_role': None},
        {'gid': 'g2', 'person_id': '2', 'name': 'Morgan Imaginary', 'office_id': 'office2',
         'speaker_type': 'member', 'chair_role': None},
        {'gid': 'g3', 'person_id': '3', 'name': 'Casey Placeholder', 'office_id': 'office3',
         'speaker_type': 'chair', 'chair_role': 'Speaker'},
        {'gid': 'g4', 'person_id': '1', 'name': 'Alex Invented', 'office_id': 'office1b',
         'speaker_type': 'member', 'chair_role': None}]


def test_mixed_patch_preserves_all_non_attribution_fields_and_clears_sole_credit():
    before = resource()
    original = deepcopy(before)
    p = R.participants(turns())
    patch = R.mixed_payload(before, p)
    assert set(patch) == {'origin', 'usermetadata', 'extra'}
    assert before == original
    after = {**before, **patch}
    assert after['origin'] == {'collaborators': [], 'tags': ['preserved']}
    assert after['usermetadata']['relations'] == ['preserved']
    assert R.labels(after, 'speaker_type') == ['multi_speaker']
    assert R.labels(after, 'party') == []
    assert R.labels(after, 'chair_role') == ['Speaker']
    assert R.labels(after, 'topic') == ['housing']
    assert after['extra']['metadata']['person_id'] is None
    assert after['extra']['metadata']['speaker_person_ids'] == ['1', '2']
    assert after['extra']['metadata']['participant_person_ids'] == ['1', '2', '3']
    assert p[0]['turn_gids'] == ['g1', 'g4']
    assert p[0]['office_ids'] == ['office1', 'office1b']
    assert all(after[k] == before[k] for k in ('slug', 'title', 'summary', 'texts'))


def test_chair_label_never_creates_personal_facet():
    before = resource()
    patch = R.chair_payload(before, 'Deputy Speaker', '3', R.participants(turns()[2:3]))
    after = {**before, **patch}
    assert R.labels(after, 'chair_role') == ['Deputy Speaker']
    assert R.labels(after, 'speaker_type') == ['chair']
    assert after['extra']['metadata']['person_id'] is None
    assert after['extra']['metadata']['chair_person_id'] == '3'
    assert R.facet_counts([after]) == {}


def test_xml_guard_prevents_reusing_legacy_person_id():
    turn = dict(turns()[0], speaker='Alex Invented', person_name='Alex Invented',
        talktype='speech', text='Policy words.', oa_office_id='office1')
    bad_stage = {'extra': {'metadata': {'person_id': 'wrong-legacy-id'}}, 'usermetadata': {'classifications': []}}
    with pytest.raises(ValueError, match='Staged/XML identity conflict'):
        R.turn_record(turn, bad_stage)
    assert R.turn_record(turn)['person_id'] == '1'


def test_incremental_batch_sizes_have_no_overlap_or_orphans():
    ranges = list(R.batch_ranges(16900))
    assert [end-start for _, start, end in ranges] == [200, 1000, 5000, 5000, 5000, 700]
    assert [i for _, start, end in ranges for i in range(start, end)] == list(range(16900))


def test_source_facet_check_distinguishes_membership_from_exclusive_credit():
    before = resource()
    docs = [{'resource_id': before['id'], 'source_status': 'xml_people_verified',
             'source_participants': R.participants(turns())}]
    wrong = R.compare_person('1', 'Alex Invented', [before], docs, set())
    assert wrong['facet_documents'] == 1
    assert wrong['facet_nonexclusive_or_wrong'] == 1
    assert wrong['source_membership_documents'] == 1
    assert wrong['source_distinct_member_turns'] == 2
    after = {**before, **R.mixed_payload(before, docs[0]['source_participants'])}
    fixed = R.compare_person('1', 'Alex Invented', [after], docs, {before['id']})
    assert fixed['facet_documents'] == 0
    assert fixed['changed_nonexclusive_documents_in_facet'] == 0
    assert fixed['source_membership_documents'] == 1


def test_gambling_reform_proxy_uses_same_turn_and_reports_policy_content():
    assert R.gambling_reform('I propose a bill to restrict gambling advertising.')
    assert not R.gambling_reform('A gambling event was discussed.')
    assert not R.gambling_reform('A gambling event. ' + 'unrelated ' * 110 + 'A housing bill.')


def test_independent_baseline_discards_ambiguous_stock_quotes(tmp_path):
    quote = 'We must protect the independence of public institutions and elected officials.'
    own = 'I propose transparent oversight of public housing construction in our region.'
    path = tmp_path/'invented.xml'
    path.write_text('<debates><speech id="one" speakerid="a" speakername="Alex Invented">'
        f'<p>{own}</p><p>{quote}</p></speech>'
        '<speech id="two" speakerid="b" speakername="Morgan Imaginary">'
        f'<p>{quote}</p></speech></debates>')
    day = R.day_paragraphs(path, {'a': '1', 'b': '2'})
    check = R.match_oa({'person_id': '1', 'text': own+'\n\n'+quote}, day)
    assert not check['mixed_people']
    assert check['source_pids'] == ['1']
    assert [t['gid'] for t in check['source_turns']] == ['one']
