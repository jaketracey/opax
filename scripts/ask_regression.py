#!/usr/bin/env python3
"""Reproducible Ask checks. CHECKED means structural checks passed, not factual truth.

Run: python3 scripts/ask_regression.py --out /tmp/opax-ask-baseline
Review every answer against response.sources and original records before shipping.
Raw responses are retained locally; commit the reviewed report, not model dumps.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
THIN = re.compile(r'does not discuss|does not (?:establish|contain)|not establish|cannot (?:establish|determine|find)|no (?:relevant|specific|information)|not (?:enough|sufficient)|not supported|not found|no evidence|do not (?:contain|establish)|not include', re.I)


def check(spec, data):
    errors, warnings = [], []
    answer = data.get('answer', '')
    sources, citations = data.get('sources', []), data.get('citations', {})
    if not isinstance(answer, str) or not answer.strip():
        return 'FAIL', ['empty answer or request error: ' + str(data.get('error', ''))]
    ids = {s['resource']: s for s in sources}
    if re.search(r'\[\^\w+\]|\[\d+\]:\s*block-|DOCUMENT CLASSIFICATION LABELS:', answer):
        errors.append('provider syntax leaked')
    for key, ranges in citations.items():
        source = ids.get(key.split('/')[0])
        if not source or not source.get('cited'):
            errors.append('citation has no cited source: ' + key)
        if not isinstance(ranges, list) or not ranges:
            errors.append('empty or invalid citation ranges')
            continue
        for span in ranges:
            if not (isinstance(span, list) and len(span) == 2 and all(type(n) is int for n in span) and 0 <= span[0] < span[1] <= len(answer)):
                errors.append('invalid citation range: ' + repr(span))
    cited_ids = {k.split('/')[0] for k in citations}
    for source in sources:
        if source.get('cited') and source['resource'] not in cited_ids:
            errors.append('cited flag without citation')
    if data.get('answer_status') == 'evidence_only':
        warnings.append('summary could not be verified; returned original evidence only')
    exp = spec.get('expect', {})
    for field in ['party', 'speaker', 'state', 'kind', 'chamber']:
        expected = exp.get('source_' + field) or spec.get('request', {}).get(field)
        if expected and expected != 'all':
            mismatched = [s for s in sources if s.get(field) != expected]
            if mismatched:
                errors.append(f'{len(mismatched)} sources outside {field}={expected}')
    if exp.get('scope_party') and data.get('scope', {}).get('party') != exp['scope_party']:
        errors.append('missing/wrong inferred party scope')
    for source in sources:
        date = source.get('date', '') or ''
        for bound, operator in [('from', lambda a,b:a<b), ('to',lambda a,b:a>b)]:
            value = exp.get('source_' + bound) or spec.get('request', {}).get(bound)
            if value and date and operator(date[:4], value[:4]):
                errors.append('source outside explicit date window')
    thin = bool(THIN.search(answer))
    if exp.get('thin_ok'):
        if not thin:
            errors.append('no explicit evidence limitation for unsupported question')
    elif not citations:
        warnings.append('no citations' + ('; evidence limitation stated' if thin else ''))
    if len(cited_ids) < exp.get('min_cited', 0):
        warnings.append(f'{len(cited_ids)} cited sources below target {exp["min_cited"]}')
    terms = exp.get('any_terms', [])
    if sum(t.lower() in answer.lower() for t in terms) < exp.get('hits', 0):
        warnings.append('expected topic terms missing')
    for term in exp.get('must_not_terms', []):
        if term.lower() in answer.lower():
            errors.append('forbidden answer text: ' + term)
    return ('FAIL' if errors else 'WARN' if warnings else 'CHECKED'), list(dict.fromkeys(errors + warnings))


def run(base, spec, timeout):
    body = {'question': spec['q'], 'kind': 'all', **spec.get('request', {})}
    if spec.get('speaker'):
        body['speaker'] = spec['speaker']
    req = urllib.request.Request(base.rstrip('/') + '/api/ask', data=json.dumps(body).encode(), headers={'content-type':'application/json','user-agent':'opax-ask-regression/2.0'})
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = json.load(response)
            status, cache = response.status, response.headers.get('x-opax-cache')
        verdict, notes = check(spec, data)
    except Exception as exc:
        data, status, cache = {'error': str(exc)}, getattr(exc, 'code', None), None
        verdict, notes = 'FAIL', [str(exc)]
    return {'id':spec['id'], 'question':spec['q'], 'request':body, 'verdict':verdict,'notes':notes,'status':status,'cache':cache,'seconds':round(time.monotonic()-start,2),'response':data}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='https://opax.com.au')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--bench', type=Path, default=ROOT/'ask_regression_questions.json')
    parser.add_argument('--only', nargs='+')
    parser.add_argument('--workers', type=int, default=2, choices=range(1,5))
    parser.add_argument('--timeout', type=int, default=150)
    args = parser.parse_args()
    bench = json.loads(args.bench.read_text())['questions']
    if args.only:
        bench = [q for q in bench if q['id'] in args.only]
        if set(args.only) - {q['id'] for q in bench}:
            parser.error('unknown question ID')
    args.out.mkdir(parents=True, exist_ok=False)
    (args.out/'manifest.json').write_text(json.dumps({'base':args.base,'started':datetime.now(timezone.utc).isoformat(),'bench':bench},indent=2)+'\n')
    rows = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for row in pool.map(lambda spec:run(args.base,spec,args.timeout),bench):
            rows.append(row)
            (args.out/(row['id']+'.json')).write_text(json.dumps(row,indent=2)+'\n')
            print(f'{row["verdict"]:7} {row["id"]:28} {row["seconds"]:6}s {"; ".join(row["notes"])}',flush=True)
    (args.out/'summary.json').write_text(json.dumps([{k:v for k,v in r.items() if k!='response'} for r in rows],indent=2)+'\n')
    return int(any(r['verdict']=='FAIL' for r in rows))

if __name__ == '__main__':
    raise SystemExit(main())
