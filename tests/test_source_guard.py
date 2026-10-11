"""Replay every review mutation in an isolated repository; never run its payload."""
import json
import subprocess
from pathlib import Path
import pytest
from scripts.source_access_guard import scan, violations


def mutations():
    cases = []
    versions = {'Mozilla':'5.0','Firefox':'128.0','Chrome':'128.0','Safari':'605.1',
                'Gecko':'20100101','AppleWebKit':'537.36','Edg':'128.0'}
    for family, version in versions.items():
        cases.append((family, 'scripts/probe.py', 'UA=' + repr(family + '/' + version) + '\n'))
    for words in ['browser' + '-ua', 'spoof' + '-user-agent']:
        cases.append((words, 'scripts/probe.py', 'FLAG=' + repr('--' + words) + '\n'))
    service = 'https://api.' + 'firecrawl.dev/v2/scrape'
    for name, module, mode in [('Firecrawl proxy', 'requests', 'basic'), ('wrapped Firecrawl proxy', 'http', 'auto')]:
        prefix = 'import requests\n' if module == 'requests' else 'from parli.ingest import http\n'
        cases.append((name, 'scripts/probe.py', prefix + module + '.post(' + repr(service) + ',json=' + repr({'proxy': mode}) + ')\n'))
    framework = 'play' + 'wright'
    cases.append(('Playwright fetch', 'scripts/probe.py', 'from ' + framework + '.sync_api import sync_' + framework + '\nwith sync_' + framework + '() as p:\n    page=p.' + 'chromium' + '.launch(headless=True).new_page()\n    page.goto("https://example.test")\n'))
    framework = 'pupp' + 'eteer'
    cases.append(('Puppeteer fetch', 'scripts/probe.mjs', f'import {framework} from "{framework}";\nconst p = await (await {framework}.launch()).newPage();\nawait p.goto("https://example.test");\n'))
    for label, path, tool, flag, agent in [
        ('curl short', 'scripts/probe.sh', 'curl', 'A', 'spoof'),
        ('wget long', 'scripts/probe.sh', 'wget', '-user-agent=', 'spoof'),
        ('extensionless shell', 'scripts/probe', 'curl', 'A', 'Mozilla' + '/5.0'),
        ('workflow identity', '.github/workflows/probe.yml', 'curl', 'A', 'spoof'),
        ('curl long', 'scripts/probe.sh', 'curl', '-user-agent', 'spoof'),
        ('wget short', 'scripts/probe.sh', 'wget', 'U', 'spoof'),
    ]:
        prefix = '#!/bin/sh\n' if label == 'extensionless shell' else 'run: ' if 'workflow' in label else ''
        cases.append((label, path, prefix + tool + ' -' + flag + ('' if flag.endswith('=') else ' ') + '"' + agent + '" https://example.test\n'))
    cases.append(('enrich identity', 'enrich/src/probe.ts', 'await fetch("https://example.test", {headers:' + json.dumps({'user-agent': 'spoof'}) + '});\n'))
    for family in ['EdgA', 'EdgiOS', 'CriOS', 'FxiOS', 'OPR', 'Trident', 'SamsungBrowser']:
        cases.append((family, 'scripts/probe', 'UA=' + repr(family + '/1.0') + '\n'))
    for mode in ['stealth', 'enhanced']:
        cases.append((mode, 'scripts/probe.mjs', 'const options = ' + json.dumps({'proxy': mode}) + ';\nwrapper(options);'))
    for words in ['use' + '-stealth', 'anti' + '-bot', 'fake' + '-ua', 'bypass' + '-waf']:
        cases.append((words, 'scripts/probe', 'FLAG=' + repr('--' + words)))
    return cases


@pytest.mark.parametrize('label,path,payload', mutations(), ids=[c[0] for c in mutations()])
def test_review_mutation_fails_repository_guard(label, path, payload, tmp_path):
    subprocess.run(['git', 'init', '-q', str(tmp_path)], check=True)
    target = tmp_path / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(payload)
    failures = scan(tmp_path)
    assert failures, label
    assert any(failure.startswith(path + ':') for failure in failures)


def test_shell_shared_identity_is_the_only_allowed_override():
    for tool, flag in [('curl', 'A'), ('curl', '-user-agent'), ('wget', 'U'), ('wget', '-user-agent')]:
        text = tool + ' -' + flag + ' "$OPAX_USER_AGENT" https://example.test'
        assert not violations('scripts/probe', text)
