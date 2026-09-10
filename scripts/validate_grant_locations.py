#!/usr/bin/env python3
"""Check the reviewed grants map against the underlying source snapshot.

No network or model calls. In particular, monetary totals use unique records,
never site markers, and invitation and award stages cannot be combined.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse


def validate(dataset, source):
    assert dataset['schema_version'] == 1
    records = dataset['records']
    ids = [r['id'] for r in records]
    assert len(ids) == len(set(ids)), 'Duplicate monetary record'
    awards = {r['ga_id']: r for r in source['awards']}
    invitations = {r['id']: r for r in source['projects']}
    by_stage = {'award': [], 'invitation': []}
    sites_by_id = {}
    for record in records:
        stage = record['record_type']
        assert stage in by_stage, 'Unknown funding stage'
        by_stage[stage].append(record)
        original = (awards if stage == 'award' else invitations)[record['id']]
        assert record['value'] == original['value'], 'Changed source amount'
        assert record['value'] > 0
        assert record['payment_verified'] is False, 'Payment evidence requires a separate review'
        assert record['verification']['status'] == 'verified'
        assert record['verification']['sources']
        assert record['sites'], 'A mapped record needs a checked venue'
        assert len({s['id'] for s in record['sites']}) == len(record['sites'])
        if stage == 'award':
            assert urlparse(record['source_url']).hostname == 'www.grants.gov.au'
            assert '/Ga/Show/' in record['source_url'], 'An award needs its individual notice'
            assert record['award_ids'] == [record['id']]
        else:
            assert original['status'] != 'Withdrawn'
            assert record['status'] == original['status']
            assert record['invitation_ids'] == [record['id']]
        assert all(i in invitations for i in record['invitation_ids'])
        assert all(i in awards for i in record['award_ids'])
        for site in record['sites']:
            assert site['site_precision'] == 'venue'
            assert -44 < site['latitude'] < -10 and 112 < site['longitude'] < 154
            assert site['address'] and site['site_name']
            assert site['state'] == record['state']
            assert not any(k in site for k in ('value', 'amount', 'allocated_value')), 'Do not assign the whole grant to every site'
            verification = site['verification']
            assert verification['status'] == 'verified' and verification['sources']
            assert any(s['url'] == site['location_source_url'] for s in verification['sources'])
            for citation in verification['sources']:
                assert citation['url'].startswith('https://')
                assert citation['excerpt'] and len(citation['content_sha256']) == 64
            boundary = verification['boundary']
            assert boundary['election'] == 2025
            assert 'AUS-March-2025-esri.zip' in boundary['source_url']
            assert len(boundary['sha256']) == 64
            assert boundary['distance_to_boundary_metres'] > 0
            assert site['electorate_2025']
            location = (site['latitude'], site['longitude'], site['site_name'])
            assert site['id'] not in sites_by_id or sites_by_id[site['id']] == location
            sites_by_id[site['id']] = location

    mapped_awards = by_stage['award']
    mapped_invitations = by_stage['invitation']
    active = [r for r in invitations.values() if r['status'] != 'Withdrawn']
    expected = {
        'total_awards': len(awards),
        'total_invitations': len(active),
        'total_invitation_records': len(invitations),
        'mapped_awards': len(mapped_awards),
        'mapped_invitations': len(mapped_invitations),
        'mapped_award_value': sum(r['value'] for r in mapped_awards),
        'mapped_invitation_value': sum(r['value'] for r in mapped_invitations),
        'total_award_value': sum(r['value'] for r in awards.values()),
        'total_invitation_value': sum(r['value'] for r in active),
        'award_site_count': sum(len(r['sites']) for r in mapped_awards),
        'invitation_site_count': sum(len(r['sites']) for r in mapped_invitations),
        'unmapped_awards': len(awards) - len(mapped_awards),
        'unmapped_invitations': len(active) - len(mapped_invitations),
        'payment_verified_records': 0,
    }
    assert dataset['coverage'] == expected, 'Coverage must reconcile unique records and source totals'
    return expected


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--locations', type=Path, default=root / 'portal/public/research/grant-locations.json')
    parser.add_argument('--source', type=Path, default=root / 'portal/public/research/mlci.json')
    args = parser.parse_args()
    coverage = validate(json.loads(args.locations.read_text()), json.loads(args.source.read_text()))
    print(json.dumps({'ok': True, **coverage}, indent=2))


if __name__ == '__main__':
    main()
