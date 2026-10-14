"""Repository source-access guard. Reports locations without source/data contents."""
from pathlib import Path
import json
import re
import subprocess

# These exercise only OPAX's preview UI, with API/provider fixtures.
E2E = {
    'scripts/check_community_tools.mjs', 'scripts/check_search_summary.mjs',
    'scripts/check_search_toolbar.mjs', 'portal/voice/check.mjs',
}
# Incoming identity classification fixtures / vendored reader analytics, never fetch UAs.
INCOMING = {'portal/test/network-block.test.mjs', 'portal/public/analytics.js'}
BROWSER = re.compile(r'\b(?:Mozilla|Firefox|Chrome|HeadlessChrome|Safari|AppleWebKit|Gecko|Edg|Edge|EdgA|EdgiOS|CriOS|FxiOS|OPR|Opera|Trident|Brave|Vivaldi|SamsungBrowser|UCBrowser|SeaMonkey|Chromium)/\d|\bMSIE\s+\d', re.I)
FLAGS = re.compile(r'--[\w-]*(?:spoof|stealth|impersonat[\w-]*|anti[-_]?bot|bypass|fake[-_]?(?:ua|agent)|browser[-_][\w-]*(?:ua|agent|identity)|(?:ua|agent)[-_][\w-]*browser)[\w-]*', re.I)
FRAMEWORK = re.compile(r'(?:\b(?:npx|bunx|uvx)\s+(?:playwright|puppeteer)\b|\bpython(?:3)?\s+-m\s+playwright\b|\b(?:from|import)\s+(?:playwright|puppeteer|selenium)\b|\b(?:from|import|require)\b[^\n;]{0,300}[\'\"](?:@playwright/[^\'\"]+|playwright(?:[./-][^\'\"]*)?|puppeteer(?:[./-][^\'\"]*)?|selenium[^\'\"]*)[\'\"]|\b(?:sync_playwright|async_playwright)\s*\(|\b(?:chromium|firefox|webkit|puppeteer)\s*\.\s*launch\s*\()', re.I)
# Reject forbidden modes even if a wrapper builds/sends the Firecrawl payload.
PROXY = re.compile(r'[\'\"]?\b(?:proxy|proxyMode|proxy_mode|stealth|antiBot|anti_bot|bypassCaptcha|solveCaptcha)[\'\"]?\s*[:=]\s*[\'\"]?(?:auto|enhanced|stealth|basic|true)\b', re.I)
HEADER = re.compile(r'[\'\"](?:user[-_]agent|userAgent)[\'\"]\s*[:=]\s*[\'\"]([^\'\"]+)[\'\"]', re.I)
SHELL_UA = re.compile(r'(?<![\w-])(?:-A|--user-agent|-U)(?:=\s*|\s+)([^\s;]+)')
CURL_HEADER = re.compile(r'(?:-H|--header)(?:=|\s+)[\'\"]?user-agent\s*:\s*([^\'\"\n]+)', re.I)
SHARED_AGENT = json.loads((Path(__file__).resolve().parents[1] / 'parli/ingest/user-agent.json').read_text())['user_agent']


def violations(name, text):
    """Pure check so mutation fixtures never execute fetching code."""
    issues = []
    own_test = name.startswith('portal/test/') or name in E2E
    fixture = own_test or '/test/' in name or Path(name).name.startswith('test_')
    for pattern, reason in ((BROWSER, 'browser identity'), (FLAGS, 'spoofing/bypass flag'),
                            (FRAMEWORK, 'browser framework outside own-site tests'), (PROXY, 'proxy/anti-bot mode')):
        if pattern is BROWSER and name in INCOMING or pattern is FRAMEWORK and own_test:
            continue
        for hit in pattern.finditer(text):
            issues.append((text.count('\n', 0, hit.start()) + 1, reason))
    if not fixture and name != 'parli/ingest/user-agent.json':
        for hit in HEADER.finditer(text):
            # Acquisition ledgers are evidence of the actual outgoing identity.
            # Only the exact shared identity is exempt; browser identities and
            # arbitrary overrides in receipts still fail the earlier checks.
            if name.startswith('data/staged/') and Path(name).name == 'receipts.json' and hit[1] == SHARED_AGENT:
                continue
            issues.append((text.count('\n', 0, hit.start()) + 1, 'literal identity instead of shared agent'))
    # Scan shell commands in workflows and extensionless scripts as well as .sh.
    # A CLI override is allowed only when it reads the shared shell identity.
    for line, content in enumerate(text.replace('\\\n', ' ').splitlines(), 1):
        if not re.search(r'\b(?:curl|wget)\b', content) or content.lstrip().startswith(('#', '//')):
            continue
        for hit in SHELL_UA.finditer(content):
            value = hit[1].strip('\'"')
            if value not in ('$OPAX_USER_AGENT', '${OPAX_USER_AGENT}'):
                issues.append((line, 'shell identity override'))
        for hit in CURL_HEADER.finditer(content):
            if hit[1].strip() not in ('$OPAX_USER_AGENT', '${OPAX_USER_AGENT}'):
                issues.append((line, 'shell identity header override'))
    return sorted(set(issues))


def scan(root):
    names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).decode().split('\0')
    failures = []
    names = sorted(name for name in set(names) - {''} if (root / name).is_file())
    # ripgrep first screens every tracked/unignored file, including extensionless
    # scripts. Its linear scan avoids Python regex work over the published corpus.
    candidates = []
    tokens = '|'.join(p.pattern for p in (BROWSER, FLAGS, FRAMEWORK, PROXY, HEADER)) + r'|\b(?:curl|wget)\b'
    for start in range(0, len(names), 400):
        result = subprocess.run(['rg', '-l', '-0', '-i', '--no-messages', tokens, '--', *names[start:start + 400]], cwd=root, capture_output=True)
        if result.returncode not in (0, 1):
            raise RuntimeError('repository guard could not scan all files')
        candidates.extend(result.stdout.decode().split('\0')[:-1])
    for name in candidates:
        try:
            raw = (root / name).read_bytes()
        except FileNotFoundError:
            continue  # A local build may have replaced a generated file during the scan.
        if b'\0' in raw:
            continue
        for line, reason in violations(name, raw.decode('utf-8', 'replace')):
            failures.append(f'{name}:{line}: {reason}')
    return failures


if __name__ == '__main__':
    import sys
    failures = scan(Path(__file__).resolve().parents[1])
    print('\n'.join(failures) if failures else 'Source-access guard passed')
    sys.exit(bool(failures))
