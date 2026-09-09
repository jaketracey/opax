#!/usr/bin/env python3
"""Validate the historical map sample; optionally reconcile fresh GrantConnect notices.

This checks evidence and accounting contracts without network or model calls.
Example: python scripts/validate_grants_history.py --source-notices /path/to/awards.json
"""
import argparse
from datetime import date
import json
import math
from pathlib import Path
from urllib.parse import urlparse


def validate(data, notices=None):
    assert data['schema_version'] == 1
    assert data['dataset'] == 'verified-historical-grant-venues'
    rows = data['records']
    assert rows and len({r['id'] for r in rows}) == len(rows), 'Duplicate monetary award'
    sites = {}
    for row in rows:
        assert row['record_type'] == 'award'
        assert row['award_ids'] == [row['id']] and row['invitation_ids'] == []
        assert row['payment_verified'] is False
        assert math.isfinite(row['value']) and row['value'] > 0
        assert date.fromisoformat(row['publish_date']) <= date.fromisoformat(data['as_of'])
        if row.get('approval_date'):
            assert date.fromisoformat(row['approval_date']) <= date.fromisoformat(row['publish_date'])
        assert row['program'] and row['activity'] and row['recipient']
        assert urlparse(row['source_url']).hostname == 'www.grants.gov.au'
        assert '/Ga/Show/' in row['source_url']
        assert row['verification']['status'] == 'verified'
        assert row['sites']
        if notices:
            original = notices[row['id']]
            for field in ('value', 'publish_date', 'approval_date', 'source_url', 'program', 'go_id'):
                assert row[field] == original[field], f'{row["id"]}: original {field} differs'
            assert row['recipient'] == original['recipient_name']
            assert row['activity'] == original['detail_activity']
        for site in row['sites']:
            assert site['id'] not in sites, 'Repeated venue marker in this sample'
            sites[site['id']] = site
            assert not {'value', 'amount', 'allocated_value'} & site.keys(), 'Do not assign grant money to each pin'
            assert site['site_precision'] == 'venue'
            assert -44 < site['latitude'] < -10 and 112 < site['longitude'] < 154
            assert site['state'] == row['state'] and site['locality'] == row['locality']
            v = site['verification']
            assert v['status'] == 'verified'
            assert v['notes'] and v['method']
            assert any(s['url'] == site['location_source_url'] for s in v['sources'])
            b = v['boundary']
            assert b['election'] == 2025 and site['electorate_2025']
            assert 'AUS-March-2025-esri.zip' in b['source_url']
            assert len(b['sha256']) == 64 and b['distance_to_boundary_metres'] > 0
            assert 'historical grant' in b['scope'], 'Do not imply historical electorate boundaries'
            if 'geometry' in v:
                g = v['geometry']
                assert g['point_within_named_polygon'] is True
                assert g['source_url'] == f'https://www.openstreetmap.org/{g["osm_type"]}/{g["osm_id"]}'
                assert g['license_url'] == 'https://www.openstreetmap.org/copyright'
                assert 'OpenStreetMap contributors' in g['attribution']
                south, north, west, east = g['bounds']
                assert south <= site['latitude'] <= north and west <= site['longitude'] <= east
                assert any(s['url'] == g['source_url'] for s in v['sources'])
            for s in row['verification']['sources'] + v['sources']:
                assert s['url'].startswith('https://') and s['excerpt'] and s['role']
                assert len(s['content_sha256']) == 64 and s['retrieved_at']
    c = data['coverage']
    amount = sum(r['value'] for r in rows)
    assert c['awards'] == {'total_records': len(rows), 'mapped_records': len(rows), 'unmapped_records': 0, 'total_value': amount, 'mapped_value': amount}
    assert c['site_count'] == len(sites)
    assert c['publication_range'] == {'from': min(r['publish_date'] for r in rows), 'to': max(r['publish_date'] for r in rows)}
    assert c['states'] == sorted({r['state'] for r in rows})
    assert c['programs'] == sorted({r['program'] for r in rows})
    assert 'not a nationwide' in c['scope']
    assert 'amendments' in data['methodology']['timeline']
    return {'awards': len(rows), 'sites': len(sites), 'current_recorded_value': amount, 'publication_range': c['publication_range']}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data', type=Path, default=Path(__file__).resolve().parents[1] / 'portal/public/research/grants-history.json')
    p.add_argument('--source-notices', type=Path)
    args = p.parse_args()
    result = validate(json.loads(args.data.read_text()), json.loads(args.source_notices.read_text()) if args.source_notices else None)
    print(json.dumps({'ok': True, **result}, indent=2))


if __name__ == '__main__':
    main()
