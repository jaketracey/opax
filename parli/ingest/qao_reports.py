"""QAO reports to Parliament: index and authorised HTML recommendations only.

No database, PDF bodies, responses, model summaries or person joins. Checkpoint
receipts and the accepted snapshot stay inside this checkout. Exit 3 keeps the
last good snapshot when access, completeness, licence or shrink guards fail.
"""
from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import urljoin, urlsplit, parse_qs
from urllib.robotparser import RobotFileParser
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup, Comment, NavigableString, Tag

ROOT = Path(__file__).resolve().parents[2]
SITE = "https://www.qao.qld.gov.au"
INDEX = SITE + "/reports-resources/reports-parliament"
COPYRIGHT = SITE + "/copyright"
LICENCE = "https://creativecommons.org/licenses/by/4.0/"
UA = "OPAX metadata research (https://opax.com.au)"
MAX_REQUESTS = 800
ID = re.compile(r"^qao-\d{4}(?:-\d{2})?-\d+$")
VERSION = re.compile(r"Report\s*:?\s+(\d+)\s*[:–−-]\s*(\d{4})(?:\s*[–−-]\s*(\d{2,4}))?", re.I)
PARSER_SCHEMA = 2


class Held(ValueError):
    """Keep the previous accepted data."""


def local_path(value):
    path = Path(value).resolve()
    if not path.is_relative_to(ROOT):
        raise Held("Output must remain inside this checkout")
    return path


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(tmp, path)


def guard_count(count, listed, previous=0):
    if type(count) is not int or count <= 0 or count != listed:
        raise Held(f"Empty or incomplete snapshot: {count} staged / {listed} listed")
    if previous and count < previous * .98:
        raise Held(f"Snapshot would shrink more than 2%: {previous} -> {count}")


def quiet_guard():
    if 8 <= datetime.now(ZoneInfo("Australia/Brisbane")).hour < 20:
        raise Held("QAO refresh held outside quiet hours (20:00–08:00 Australia/Brisbane)")


def source_url(value, base=INDEX):
    url = urljoin(base, value)
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.netloc != "www.qao.qld.gov.au":
        raise Held("Unexpected source host or scheme")
    return url


class Client:
    def __init__(self, session=None, sleep=time.sleep, clock=time.monotonic, quiet=False, cache=None):
        self.session = session or requests.Session()
        self.sleep, self.clock, self.quiet = sleep, clock, quiet
        self.requests, self.last, self.spacing, self.robot = 0, None, 2.0, None
        self.cache = local_path(cache) if cache else None

    def get(self, url, policy=False):
        source_url(url)
        if self.robot and not self.robot.can_fetch(UA, url):
            raise Held("robots.txt disallows requested source page")
        for attempt in range(4):
            if self.quiet: quiet_guard()
            if self.requests >= MAX_REQUESTS: raise Held("800-request run ceiling reached; checkpoint retained")
            if self.last is not None:
                self.sleep(max(0, self.spacing - (self.clock() - self.last)))
            if self.quiet: quiet_guard()
            self.last = self.clock()
            self.requests += 1
            response = self.session.get(url, headers={"User-Agent": UA}, timeout=45, allow_redirects=False)
            body = response.text
            if re.search(r"cf-chl-|cf-mitigated|challenge-platform|<title>\s*(?:just a moment|access denied)|verify you are human|[gh]-recaptcha|hcaptcha", body, re.I) or response.headers.get("cf-mitigated") == "challenge":
                raise Held("Source challenge detected; stopped without bypass")
            if response.status_code == 429 or 500 <= response.status_code <= 599:
                retry = response.headers.get("Retry-After", "")
                try: delay = float(retry)
                except ValueError:
                    try: delay = (parsedate_to_datetime(retry) - datetime.now(timezone.utc)).total_seconds()
                    except (ValueError, TypeError): delay = 0
                # Long waits remain resumable and do not occupy the nightly job.
                delay = max(delay, 10 * 2 ** attempt)
                if delay > 60: raise Held("Source requested long backoff; checkpoint retained")
                self.sleep(delay)
                continue
            if response.status_code != 200: raise Held(f"Source HTTP {response.status_code}; checkpoint retained")
            if not policy and "html" not in response.headers.get("Content-Type", "text/html"):
                raise Held("Unexpected non-HTML source response; no PDF bodies acquired")
            if self.cache:
                self.cache.mkdir(parents=True, exist_ok=True)
                key = hashlib.sha256(url.encode()).hexdigest()
                (self.cache / (key + ".html")).write_text(body)
                digest = hashlib.sha256(body.encode()).hexdigest()
                (self.cache / (digest + ".html")).write_text(body)
                atomic_json(self.cache / (key + ".json"), {"url": url, "sha256": digest})
            return body
        raise Held("Source remained unavailable after bounded backoff")

    def policies(self):
        robots = self.get(SITE + "/robots.txt", policy=True)
        robot = RobotFileParser(); robot.parse(robots.splitlines()); self.robot = robot
        self.spacing = max(2.0, float(robot.crawl_delay(UA) or robot.crawl_delay("*") or 0))
        rate = robot.request_rate(UA) or robot.request_rate("*")
        if rate: self.spacing = max(self.spacing, rate.seconds / rate.requests)
        copyright_html = self.get(COPYRIGHT)
        copyright_text = text(BeautifulSoup(copyright_html, "html.parser").find("main"))
        if not all(v in copyright_text for v in ("Unless otherwise noted", "Creative Commons Attribution 4.0", "State of Queensland", "copyright notice")):
            raise Held("QAO licence grant changed or could not be verified")
        return {"robots_sha256": hashlib.sha256(robots.encode()).hexdigest(),
                "copyright_sha256": hashlib.sha256(copyright_text.encode()).hexdigest(),
                "copyright_notice": "© The State of Queensland (Queensland Audit Office) " + str(datetime.now().year),
                "licence_url": LICENCE, "copyright_url": COPYRIGHT,
                "minimum_spacing_seconds": self.spacing}


def text(node):
    # HTML formatting whitespace is normalised, source words/punctuation are not.
    def content(n):
        if isinstance(n, Comment): return ""
        if isinstance(n, NavigableString): return str(n)
        if not isinstance(n, Tag): return ""
        if n.name in ("script", "style"): return ""
        if n.name == "br": return "\n"
        value = "".join(content(c) for c in n.children)
        return "\n" + value + "\n" if n.name in ("p", "div", "li", "ul", "ol", "td", "th", "tr", "h1", "h2", "h3", "h4") else value
    return re.sub(r"\s+", " ", content(node)).strip() if node else ""


def parse_index(html, url):
    soup = BeautifulSoup(html, "html.parser")
    view = soup.select_one(".view-reports-to-parliament")
    if not view: raise Held("Reports index structure missing")
    records = []
    for card in view.select(".views-row"):
        link = card.select_one(".field--name-node-title a")
        version = text(card.select_one(".field--name-field-report-version, .field--name-field-subtitle"))
        match = VERSION.search(version)
        date = card.select_one(".field--name-field-tabled-date time[datetime]")
        if not link or not match or not date: raise Held("Incomplete report index row")
        number, start, end = match.groups()
        year = start + ("-" + end[-2:] if end else "")
        records.append({"id": f"qao-{year}-{int(number)}", "number": int(number), "year": year,
                        "report_label": version, "title": text(link),
                        "tabled_date": datetime.strptime(re.sub(r"^Tabled date:\s*", "", text(date)), "%d %B %Y").date().isoformat(),
                        "sectors": [text(n) for n in card.select(".field--name-field-sectors .field__item")],
                        "canonical_url": source_url(link["href"]), "entities": []})
    if not records: raise Held("Empty reports index page")
    next_link = view.select_one('a[rel="next"], .pager__item--next a')
    last_link = view.select_one('.pager__item--last a')
    last_page = int(parse_qs(urlsplit(urljoin(url, last_link["href"])).query).get("page", [0])[0]) if last_link else None
    return records, source_url(next_link["href"], url) if next_link else None, last_page


def licence_review(main):
    # A notice is cleared only by a recognised grant/owner notice. Unknown
    # reuse terms and third-party captions hold the entire body projection.
    evidence = []
    cue = re.compile(r"copyright|©|all rights reserved|creative commons|\bCC[ -]BY\b|otherwise noted|"
        r"licen[sc]ed under|(?:used|available|reproduced) under (?:a |the )?licen[sc]e|licen[sc]e (?:terms|notice)|"
        r"\b(?:reuse|re-use|reproduction)\b.{0,80}(?:terms|permission|conditions|restricted)|"
        r"\buse (?:only )?under\b.{0,80}(?:terms|rights|permission)|"
        r"permission to (?:reproduce|use|reuse)|reproduced with permission|"
        r"\b(?:image|photo(?:graph)?|illustration)\s*:?\s+(?:courtesy|credit|provided by|supplied by)", re.I)
    known_footer = set()
    for node in main.find_all(["p", "div", "span", "small", "li", "figure", "figcaption", "caption", "td", "th", "a", "h2", "h3", "h4", "h5", "h6"]):
        classes = ' '.join(node.get('class', []))
        caption = node.name in ('figure', 'figcaption', 'caption') or 'caption' in classes.lower()
        notice = bool(re.search(r'(?:copyright|licen[sc]e|reuse|rights)[_-]?(?:notice|terms)|(?:notice|terms)[_-]?(?:copyright|licen[sc]e|reuse|rights)', classes, re.I))
        if not caption and not notice and node.find(["p", "div", "li", "figcaption", "caption"]): continue
        value = text(node)
        caption_credit = caption and re.search(r'\b(?:source|credit|courtesy|provided|supplied)\b', value, re.I)
        if cue.search(value) or caption_credit or (notice and value):
            if value not in evidence: evidence.append(value)
            if value == "Copyright ©" and (node.get('href') in ('/copyright', COPYRIGHT)
                    or node.find('a', href=re.compile(r'^(?:https://www.qao.qld.gov.au)?/copyright$'))):
                known_footer.add(value)
            if caption_credit and re.fullmatch(r'(?:Source|Credit):\s*(?:QAO|Queensland Audit Office)\.?', value, re.I):
                known_footer.add(value)
    evidence = [v for v in evidence if not any(v != larger and v in larger for larger in evidence)]
    exceptions = []
    owner_notice = re.compile(r'^(?:Copyright\s*)?©\s*(?:\d{4}\s*)?(?:The\s+)?(?:State of Queensland(?:\s*\(Queensland Audit Office\))?|Queensland Audit Office)\s*\d{0,4}\.?$', re.I)
    grant_notice = re.compile(r'^(?:This (?:work|report|material) is )?(?:licensed under |available under )?(?:a )?(?:Creative Commons Attribution 4\.0(?: International)?(?: licen[sc]e)?|CC BY 4\.0)\.?$', re.I)
    for value in evidence:
        if value in known_footer or owner_notice.fullmatch(value) or grant_notice.fullmatch(value): continue
        exceptions.append("Uncleared copyright/licensing notice: " + value)
    return {"status": "exception" if exceptions else "cc-by-4.0", "licence_url": LICENCE,
            "copyright_url": COPYRIGHT, "checked": True, "notices": evidence,
            "exceptions": exceptions, "body_skipped": bool(exceptions)}


def clean_markup(node):
    # Keep only source text and list/paragraph structure; strip all source links,
    # embeds, images and scripts. No response column enters this projection.
    if isinstance(node, Comment): return ""
    if isinstance(node, NavigableString):
        from html import escape
        return escape(str(node))
    if not isinstance(node, Tag) or node.name in ("script", "style", "img", "iframe"): return ""
    content = "".join(clean_markup(n) for n in node.children)
    if node.name in ("p", "ul", "ol", "li", "em", "strong", "br"):
        attrs = ''
        if node.name == 'ol':
            if node.get('type') in ('1', 'a', 'A', 'i', 'I'): attrs += f' type="{node["type"]}"'
            if re.fullmatch(r'-?\d+', str(node.get('start', ''))): attrs += f' start="{int(node["start"])}"'
        if node.name == 'li' and re.fullmatch(r'-?\d+', str(node.get('value', ''))): attrs += f' value="{int(node["value"])}"'
        return f"<{node.name}{attrs}>" + content + f"</{node.name}>"
    return content


# Shared by the exporter: only list marker attributes, never arbitrary HTML.
SAFE_MARKUP = re.compile(r'</?(?:p|ul|li|em|strong|br)>|</ol>|<ol(?: type="[1aAiI]")?(?: start="-?\d+")?>|<li value="-?\d+">')


def recommendation_blocks(main):
    """All text fields in a chapter, with introductions/addressees kept together."""
    dedicated = list(main.select('.field--name-field-recommendations'))
    if dedicated: return [recommendation_scope(copy.copy(field)) for field in dedicated]
    blocks = []
    headings = [h for h in main.find_all(['h2', 'h3', 'h4']) if re.fullmatch(r'(?:\d+\.?\s*)?Recommendations?', text(h), re.I)]
    chapters = [h for h in headings if h.find_parent(class_='paragraph--type--chapter-header')]
    # A report-on-a-page summary may repeat the heading/count without its text.
    for heading in chapters or headings:
        chapter = heading.find_parent(class_='paragraph--type--chapter-header')
        block = BeautifulSoup('<div></div>', 'html.parser').div
        if chapter:
            for sibling in chapter.parent.find_next_siblings():
                if sibling.select_one('.paragraph--type--chapter-header'): break
                for field in sibling.select('.field--name-field-text'):
                    block.append(copy.copy(field))
        else:
            # Legacy in-field headings; never cross into the following section.
            for sibling in heading.find_next_siblings():
                if sibling.name in ('h2', 'h3', 'h4') and int(sibling.name[1]) <= int(heading.name[1]): break
                block.append(copy.copy(sibling))
        blocks.append(recommendation_scope(block))
    return blocks


def recommendation_scope(block):
    """Stop at response references, retaining any reiterated source advice."""
    ended = False
    def trim(node):
        nonlocal ended
        for child in list(node.children):
            if isinstance(child, Tag) and child.name in ('h2', 'h3', 'h4', 'h5'):
                value = text(child)
                if re.match(r'Reference to comments', value, re.I): ended = True
            if ended: child.extract()
            elif isinstance(child, Tag): trim(child)
    trim(block)
    return block


def recommendation_parts(block):
    # A stated count of new recommendations does not count a following
    # prior-year status section. Reconcile each section independently while
    # retaining numbered source advice in both.
    parts, part = [], BeautifulSoup('<div></div>', 'html.parser').div
    def flatten(node):
        if isinstance(node, Tag) and node.name in ('div', 'section'):
            for child in node.children: yield from flatten(child)
        else: yield node
    for node in flatten(block):
        if isinstance(node, Tag) and node.name in ('h2', 'h3', 'h4', 'h5') and re.search(r'prior year|previous years?|status of recommendations|recommendations? (?:for|to)\b', text(node), re.I):
            if part.contents: parts.append(part)
            part = BeautifulSoup('<div></div>', 'html.parser').div
        part.append(copy.copy(node))
    if part.contents: parts.append(part)
    return parts


def recommendation_evidence(block):
    """Read source markers independently of the projection parser."""
    numbers, declared = [], []
    words = dict(zip(('zero','one','two','three','four','five','six','seven','eight','nine','ten'), range(11)))
    for paragraph in block.find_all('p'):
        value = text(paragraph)
        match = re.search(r'\b(?:[Ww]e (?:make|made|have made)(?: the following)?|[Tt]he following)\s+(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:new\s+)?recommendations?\b', value)
        if match: declared.append(int(match[1]) if match[1].isdigit() else words[match[1]])
        elif re.search(r'\b[Ww]e make the following new recommendation\b', value): declared.append(1)
    def walk(node):
        if not isinstance(node, Tag): return
        if node.name == 'tr':
            cells = node.find_all(['td', 'th'], recursive=False)
            if not cells: return
            marker = re.fullmatch(r'(?:REC\s*)?(\d+)[.)]?', text(cells[0]), re.I)
            if marker and len(cells) > 1: numbers.append(int(marker[1])); return
            walk(cells[0]); return
        if node.name == 'ol':
            if node.get('type', '1') != '1': return
            number = int(node.get('start', 1))
            for item in node.find_all('li', recursive=False):
                number = int(item.get('value', number)); numbers.append(number); number += 1
            return
        if node.name == 'p':
            marker = re.match(r'^(\d+)[.)]\s*', text(node))
            if marker: numbers.append(int(marker[1]))
            return
        if node.name in ('td', 'th') and not node.find(['p', 'ol', 'table']):
            marker = re.match(r'^(\d+)[.)]\s*', text(node))
            if marker: numbers.append(int(marker[1])); return
        if node.name == 'ul': return
        for child in node.children: walk(child)
    walk(block)
    return numbers, sum(declared) if declared else None


def public_body(name):
    # Explicit public-body designations only. Generic recipient groups remain
    # recommendation addressees, never audited entities or identity nodes.
    return bool(name and name[0].isupper() and len(name) < 160
        and re.search(r"department|council|university|Queensland (?:Health|Corrective Services|Treasury|Police Service|Fire|Rail)|Legal Aid Queensland|hospital and health service|commission|authority|public trustee|TAFE Queensland|State of Queensland|Audit Office|Office of|Non-State Schools Accreditation Board|Energy Queensland|Seqwater|Sunwater|CS Energy|Stanwell|Ergon|Energex", name, re.I)
        and not re.search(r"\b(?:Mr|Mrs|Ms|Dr|Professor|Minister|private|non-government|recommendations?|report|whether|should|this|was|were|plans?|invests?|designs?|builds?|lead|manage|has|have|provides?|that|which|focused|focusing|assessed|effectively|process(?:es)?)\b", name, re.I))


def recommendations(main):
    rows, seen = [], set()
    for field in [part for block in recommendation_blocks(main) for part in recommendation_parts(block)]:
        expected_numbers, stated_count = recommendation_evidence(field)
        pending, addressee, active, stopped = [], None, None, False

        def recipient(value):
            named = re.match(r'^(.+?)\s+should\b', value, re.I)
            if named and named.group(1).strip().lower() not in ('this', 'these', 'it'): return named.group(1).strip()
            named = re.match(r'^(?:the\s+)?((?:Department|Queensland|Public Service)[^:]{2,180}?)\s+(?:updates?|reports?|leads?|develops?|implements?|provides?)\b', value, re.I)
            if named: return named.group(1).strip()
            match = re.search(r"We(?: also)? recommend(?:\s+(?:that|to))?\s+(.+?)(?::|\s+(?:develop|finalise|improve|review|ensure|establish|provide|lead|strengthen|implement|consider|adopt|coordinate|report|work|evaluate|monitor|assess|engage|mandate|should)\w*\b)", value, re.I)
            result = match.group(1).strip().rstrip(',') if match else None
            return None if result in ('that', 'to') else result

        def add(number, html):
            nonlocal active
            active = {"number": number, "html": html, "addressed_to": addressee, "source_text": "QAO's text"}
            pending.append(active)

        def walk(node):
            nonlocal addressee, active, stopped
            if not isinstance(node, Tag) or stopped: return
            value = text(node)
            if node.name in ('h2', 'h3', 'h4', 'h5') and re.match(r'Reference to comments', value, re.I):
                stopped = True
                return
            if node.name in ('td', 'th', 'strong', 'h3', 'h4') and not node.find(['p', 'ol', 'ul']):
                intro = re.search(r"We(?: also)? recommend(?:\s+(?:that|to))?\s+(.+?):", value, re.I)
                councils = re.match(r'For (councils.+?),\s*we recommend they:', value, re.I)
                if councils or intro:
                    addressee = councils.group(1) if councils else intro.group(1).strip()
                    active = None
                    return
            if node.name in ('table', 'tbody', 'thead'):
                for child in node.children: walk(child)
            elif node.name == 'tr':
                # QAO recommendation/response tables put source advice in the
                # first column. Never parse the entity's response columns.
                cells = node.find_all(['td', 'th'], recursive=False)
                if not cells: return
                numbered = re.fullmatch(r'(?:REC\s*)?(\d+)[.)]?', text(cells[0]), re.I)
                if numbered and len(cells) > 1:
                    add(int(numbered.group(1)), '')
                    # The entire advice cell is QAO's text. Introductory
                    # recipient sentences within it must not reset the record.
                    direct = recipient(text(cells[1]))
                    if direct: active['addressed_to'] = direct
                    active['html'] = ''.join(clean_markup(n) for n in cells[1].children)
                elif not text(cells[0]) and len(cells) > 1 and re.match(r'We(?: also)? recommend\b.+:', text(cells[1]), re.I):
                    # An icon-only first cell is not a recommendation/response
                    # column. The second cell carries the source introduction.
                    walk(cells[1])
                elif len(cells) == 1 and not expected_numbers and stated_count is not None and not cells[0].find('ol') and re.match(r'We recommend\b', text(cells[0]), re.I):
                    add(None, ''.join(clean_markup(n) for n in cells[0].children))
                    active['addressed_to'] = recipient(value) or addressee
                else: walk(cells[0])
            elif node.name in ('td', 'th') and not node.find(['p', 'ol', 'table']) and re.match(r'^\d+[.)]\s*', value):
                fragment = BeautifulSoup('<p></p>', 'html.parser').p
                for child in node.children: fragment.append(copy.copy(child))
                walk(fragment)
            elif node.name in ('h2', 'h3', 'h4'):
                active = None
                if public_body(value): addressee = value
                group = re.fullmatch(r'Recommendations? (?:for|to) (.+)', value, re.I)
                if group: addressee = group.group(1)
            elif node.name == 'p':
                intro = re.search(r"We(?: also)? recommend(?:\s+(?:that|to))?\s+(.+?):", value, re.I)
                numbered = re.match(r'^(\d+)[.)]\s*', value)
                if intro and not numbered:
                    addressee, active = re.sub(r'\s+(?:mandate|should)\s*$', '', intro.group(1).strip(), flags=re.I), None
                    return
                if numbered:
                    if intro: addressee = re.sub(r'\s+(?:mandate|should)\s*$', '', intro.group(1).strip(), flags=re.I)
                    fragment = BeautifulSoup(str(node), 'html.parser').p
                    # Remove just the source numbering, which the outer list
                    # renders via li[value]. Keep inline words and punctuation.
                    first = next((n for n in fragment.descendants if isinstance(n, NavigableString) and n.strip()), None)
                    if first is not None:
                        first.replace_with(re.sub(r'^\s*\d+[.)]\s*', '', str(first), count=1))
                    direct = recipient(text(fragment))
                    if direct: addressee = direct
                    add(int(numbered.group(1)), clean_markup(fragment))
                elif node.find('strong') and text(node.find('strong')) == value:
                    active = None
                elif active and not node.find('cite') and not re.match(r'(?:Note\s*\d*[:.]|In accordance with|Reference to comments)', value, re.I):
                    active['html'] += clean_markup(node)
            elif node.name == 'ol':
                if node.get('type', '1') != '1':
                    if active: active['html'] += clean_markup(node)
                    return
                number = int(node.get('start', 1))
                for item in node.find_all('li', recursive=False):
                    number = int(item.get('value', number))
                    direct = recipient(text(item))
                    if direct: addressee = direct
                    elif re.search(r'we recommend that\s*:', text(item), re.I): addressee = None
                    add(number, ''.join(clean_markup(n) for n in item.children))
                    number += 1
            elif node.name == 'ul':
                if active:
                    active['html'] += clean_markup(node)
                    if not active['addressed_to']:
                        addresses = [re.match(r'(?:the\s+)?((?:Department|Queensland|Public Service|Tourism and Events Queensland)[^:]{2,160}?)\s+(?:leads?|develops?|implements?|provides?|should)\b', text(item)) for item in node.find_all('li', recursive=False)]
                        named = [m.group(1) for m in addresses if m]
                        if named: active['addressed_to'] = '; '.join(named)
            else:
                for child in node.children: walk(child)

        walk(field)
        parsed_numbers = [r['number'] for r in pending if r['number'] is not None and text(BeautifulSoup(r['html'], 'html.parser'))]
        if parsed_numbers != expected_numbers or any(not text(BeautifulSoup(r['html'], 'html.parser')) for r in pending):
            raise Held(f'Recommendation numbering mismatch: source {expected_numbers}, parsed {parsed_numbers}')
        if stated_count is not None and len(pending) != stated_count:
            raise Held(f'Recommendation count mismatch: page states {stated_count}, parsed {len(pending)}')
        for rec in pending:
            rec['text'] = text(BeautifulSoup(rec['html'], 'html.parser'))
            key = (rec['number'], rec['text'], rec['addressed_to'])
            if rec['text'] and key not in seen:
                seen.add(key); rows.append(rec)
    return rows


def audited_entities(main):
    entities = []
    def names(value):
        value = re.sub(r'^(?:the\s+)', '', value).rstrip('.,')
        value = re.sub(r'\s*\((?:which|the department|[A-Z]{2,})[^)]*\)', '', value)
        value = re.split(r'\s+(?:as the entity|focusing on|that has|invests? in|designs?|lead(?:s)? and|builds?|plans?|manages?|has|have|is|are)\b', value)[0]
        value = re.sub(r'\s+and local governments\b.*$', '', value)
        return [n for n in (re.sub(r'^the\s+', '', n.strip()).rstrip('.,') for n in re.split(r'\s+and\s+(?=(?:the\s+)?(?:Department|Queensland|Non-State Schools))', value)) if public_body(n)]
    # Take explicitly labelled audited-entity fields/scope tables. Never turn
    # every organisation mentioned in a report or recommendation into an auditee.
    for field in main.select('.field--name-field-entities-audited, .field--name-field-audited-entities'):
        for node in field.select('.field__item') or [field]:
            value = text(node)
            entities.extend(names(value))
    for heading in main.find_all(["h2", "h3", "h4"]):
        if not re.fullmatch(r"(?:\d+\.?\s*)?(?:Entities audited|Who did we audit\?|What did we audit\?|Audit scope)", text(heading), re.I): continue
        for node in heading.find_next_siblings():
            if node.name in ("h2", "h3", "h4"): break
            for item in node.select('li, td'):
                value = text(item)
                if len(value) < 220: entities.extend(names(value))
    for field in main.select('.field--name-field-audit-objective'):
        for item in field.select('li'):
            value = text(item)
            if len(value) < 220: entities.extend(names(value))
    # Explicit audit-scope sentences, bounded to the entity phrase. A recipient
    # alone is not audit-scope evidence.
    for paragraph in main.find_all("p"):
        value = text(paragraph)
        objective = re.search(r'(?:objective of (?:our|this|the) audit was to assess|This audit assess(?:ed|es))\s+how (?:well|effectively)\s+([A-Z][^.;:]{2,150}?)(?:\s+\([A-Z0-9]+\))?\s+(?:has|have|is|are|plans?|manages?|delivers?)\b', value)
        if objective: entities.extend(names(objective.group(1).strip()))
        scope = re.search(r'(?:assess(?:ed)?|determin(?:e|ed)|examin(?:e|ed)|evaluat(?:e|ed))\s+(?:whether|how (?:well|effectively|efficiently))\s+(?:the\s+)?([A-Z][^.;:]{2,150}?)(?:\s+\([A-Z0-9]+\))?\s+(?:has|have|is|are|plans?|manages?|delivers?|effectively|efficiently)\b', value)
        if scope: entities.extend(names(scope.group(1).strip()))
        for match in re.finditer(r"(?:This (?:report|audit) (?:examines|assesses|assessed)|We (?:assessed|examined|audited))\s+(?:how effectively\s+)?([A-Z][^.;:]{2,150}?)(?:\s+\([A-Z0-9]+\))?\s+(?:plans?\b|manages?\b|delivers?\b|provides?\b|is\b|are\b|has\b|have\b|'s\b|’s\b)", value):
            name = match.group(1).strip()
            entities.extend(names(name))
    return sorted(set(entities))


def parse_report(html, row):
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find("main")
    if not main or not soup.find("h1"): raise Held("Report detail structure missing")
    if text(soup.find("h1")) != row["title"]: raise Held("Report title changed between index and detail")
    licence = licence_review(soup)
    pdf = main.select_one('.field--name-field-report-products a[href$=".pdf"]')
    if not pdf:
        pdf = next((a for a in main.select('a[href]') if re.fullmatch(r'(?:download full )?report pdf', text(a), re.I)), None)
    return {**row, "pdf_url": source_url(pdf["href"]) if pdf else None,
            "entities": [] if licence["body_skipped"] else audited_entities(main),
            "recommendations": [] if licence["body_skipped"] else recommendations(main),
            "licence": licence, "page_sha256": hashlib.sha256(html.encode()).hexdigest()}


def verify_listing(checkpoint, client, pages):
    """Never certify cached membership without rereading every listing page."""
    verify_url, verify_page = INDEX, 0
    while verify_url:
        if verify_page >= pages: raise Held('Report index gained pages during acquisition')
        fresh, nxt, last = parse_index(client.get(verify_url), verify_url)
        saved = json.loads((checkpoint / f'index-{verify_page}.json').read_text())
        if (verify_url, fresh, nxt, last) != (saved['url'], saved['records'], saved['next'], saved['last_page']):
            raise Held(f'Report index changed during acquisition on page {verify_page + 1}; fresh listing required')
        verify_url, verify_page = nxt, verify_page + 1
    if verify_page != pages: raise Held('Report index lost pages during acquisition')
    return verify_page


def acquire(out, checkpoint, client, refresh=False):
    started = time.monotonic()
    out, checkpoint = local_path(out), local_path(checkpoint)
    previous = json.loads(out.read_text()) if out.exists() else None
    policy = client.policies()
    checkpoint.mkdir(parents=True, exist_ok=True)
    day = datetime.now(timezone.utc).date().isoformat()
    config = {"schema": PARSER_SCHEMA, "index": INDEX, "day": day}
    config_path = checkpoint / "config.json"
    reusable = not refresh and config_path.exists() and json.loads(config_path.read_text()) == config and not (checkpoint / "complete.json").exists()
    if not reusable:
        for path in checkpoint.glob("*.json"): path.unlink()
    atomic_json(config_path, config)
    url, page, listed, urls = INDEX, 0, {}, set()
    final_page = None
    while url:
        if url in urls: raise Held("Paging loop detected")
        urls.add(url)
        receipt = checkpoint / f"index-{page}.json"
        if receipt.exists(): data = json.loads(receipt.read_text())
        else:
            html = client.get(url)
            records, nxt, last = parse_index(html, url)
            data = {"url": url, "records": records, "next": nxt, "last_page": last, "sha256": hashlib.sha256(html.encode()).hexdigest()}
            atomic_json(receipt, data)
        if data["url"] != url: raise Held("Checkpoint paging mismatch")
        if page == 0: final_page = data["last_page"]
        for row in data["records"]:
            if row["id"] in listed: raise Held("Duplicate report id across index pages")
            listed[row["id"]] = row
        url, page = data["next"], page + 1
        print(f"[qao] index pages {page}; listed {len(listed)}; requests {client.requests}", flush=True)
    if final_page is not None and page != final_page + 1: raise Held("Paging stopped before the advertised last page")
    guard_count(len(listed), len(listed), previous["count"] if previous else 0)
    records = []
    for row in sorted(listed.values(), key=lambda r: r["id"]):
        receipt = checkpoint / (row["id"] + ".json")
        if receipt.exists(): record = json.loads(receipt.read_text())
        else:
            record = parse_report(client.get(row["canonical_url"]), row)
            atomic_json(receipt, record)
        if any(record.get(k) != v for k, v in row.items() if k != "entities"):
            raise Held("Detail checkpoint does not match index")
        records.append(record)
        if len(records) % 10 == 0: print(f"[qao] staged {len(records)} / {len(listed)}; requests {client.requests}", flush=True)
    guard_count(len(records), len(listed), previous["count"] if previous else 0)
    # Cached pages accelerate resume, but cannot certify membership. Re-fetch
    # every listing page and compare its rows and paging edges before acceptance.
    verify_page = verify_listing(checkpoint, client, page)
    generated = datetime.now(timezone.utc).isoformat()
    snapshot = {"schema": 1, "scope": "reports to Parliament: index + HTML recommendations", "complete": True,
                "generated_at": generated, "count": len(records), "listed": len(listed), "pages": page,
                "policy": policy, "listing_verified_pages": verify_page, "reports": records}
    # Download dates/receipts are operational evidence; an unchanged catalogue
    # keeps its accepted timestamp and bytes, with a separate latest-run receipt.
    stable = lambda values: [{k: v for k, v in r.items() if k != 'page_sha256'} for r in values]
    unchanged = previous and stable(previous["reports"]) == stable(records) and previous["policy"] == policy
    if not unchanged: atomic_json(out, snapshot)
    summary = {"staged": len(records), "listed": len(listed), "recommendations": sum(len(r["recommendations"]) for r in records),
               "requests": client.requests, "seconds": round(time.monotonic() - started, 2), "unchanged": bool(unchanged),
               "listing_verified_pages": verify_page,
               "licence_exceptions": [{"id": r["id"], "notices": r["licence"]["exceptions"]} for r in records if r["licence"]["body_skipped"]]}
    atomic_json(checkpoint / "complete.json", summary)
    atomic_json(out.with_name("last-run.json"), summary)
    print(json.dumps(summary), flush=True)
    return previous if unchanged else snapshot


def reparse_cache(out, checkpoint, client=None):
    """Reapply the parser to verified saved HTML, with zero source requests."""
    started = time.monotonic()
    out, checkpoint = local_path(out), local_path(checkpoint)
    snapshot = json.loads(out.read_text())
    rows = []
    for row in snapshot['reports']:
        key = hashlib.sha256(row['canonical_url'].encode()).hexdigest()
        receipt = json.loads((checkpoint / 'http' / (key + '.json')).read_text())
        html = (checkpoint / 'http' / (key + '.html')).read_bytes().decode('utf-8')
        if receipt['url'] != row['canonical_url'] or hashlib.sha256(html.encode()).hexdigest() != receipt['sha256']:
            raise Held('Saved HTTP receipt hash mismatch')
        archive = checkpoint / 'http' / (receipt['sha256'] + '.html')
        if not archive.exists(): archive.write_bytes(html.encode())
        parsed = parse_report(html, row)
        rows.append(parsed)
        atomic_json(checkpoint / (row['id'] + '.json'), parsed)
    guard_count(len(rows), snapshot['listed'], snapshot['count'])
    if client:
        client.policies()
        snapshot['listing_verified_pages'] = verify_listing(checkpoint, client, snapshot['pages'])
    snapshot['reports'] = rows
    atomic_json(out, snapshot)
    receipt = json.loads(out.with_name('last-run.json').read_text())
    receipt['recommendations'] = sum(len(r['recommendations']) for r in rows)
    receipt['licence_exceptions'] = [{'id':r['id'], 'notices':r['licence']['exceptions']} for r in rows if r['licence']['body_skipped']]
    receipt['reparsed_from_receipts'] = True
    receipt['reparse_seconds'] = round(time.monotonic() - started, 2)
    if client:
        receipt['fix_run_requests'] = client.requests
        receipt['listing_verified_pages'] = snapshot['listing_verified_pages']
    atomic_json(out.with_name('last-run.json'), receipt)
    atomic_json(checkpoint / 'complete.json', receipt)
    print(json.dumps(receipt), flush=True)
    return snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(ROOT / "scripts/state/qao/snapshot.json"))
    parser.add_argument("--checkpoint", default=str(ROOT / "scripts/state/qao/checkpoint"))
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--quiet-hours", action="store_true", help="Weekly refresh: 20:00–08:00 Brisbane")
    parser.add_argument("--reparse-cache", action="store_true", help="Reapply parser to saved, hash-verified HTML; zero source requests")
    parser.add_argument("--verify-listing", action="store_true", help="With receipt replay, reread policies and every listing page before acceptance")
    args = parser.parse_args()
    client = Client(quiet=args.quiet_hours, cache=Path(args.checkpoint) / "http")
    try:
        if args.reparse_cache:
            reparse_cache(args.out, args.checkpoint, client if args.verify_listing else None)
            return 0
        acquire(args.out, args.checkpoint, client, args.refresh)
        return 0
    except (Held, OSError, ValueError, requests.RequestException) as error:
        print(f"QAO HELD: {error}; requests {client.requests}", file=sys.stderr)
        return 3


if __name__ == "__main__": sys.exit(main())
