"""Legacy HTML fallback. XML is the authoritative source of turn identities."""
import re
from bs4 import BeautifulSoup
from .speaker_roles import chair_role


def parse_debate_html(html: str) -> list[dict]:
    # libxml closes a paragraph when the next <p> starts. html.parser leaves
    # the legacy unclosed byline around later speakers and their paragraphs.
    soup = BeautifulSoup(html, 'lxml')
    main = soup.find('div', class_='main')
    if main is None:
        return []
    speeches, current, paragraphs = [], None, []

    def flush():
        if current is not None and paragraphs:
            speeches.append(current | {'text': '\n\n'.join(paragraphs)})

    # Source order; never recursively collect a byline's descendants as body.
    for el in main.find_all('p'):
        if 'speaker' in (el.get('class') or []):
            flush()
            paragraphs = []
            strong, small = el.find('strong'), el.find('small')
            speaker = strong.get_text(strip=True) if strong else ''
            party = electorate = ''
            match = re.search(r'\(([^)]+)\)', small.get_text(strip=True) if small else '')
            if match:
                parts = [p.strip() for p in match[1].split(',')]
                party = parts[1] if len(parts) > 1 else parts[0]
                electorate = parts[0] if len(parts) > 1 else ''
            role = chair_role(party)
            anchor = el.find('a', attrs={'name': True})
            current = {'speaker': speaker, 'party': party, 'electorate': electorate,
                       'speaker_type': 'chair' if role else 'member', 'chair_role': role,
                       'citation_anchor': el.get('id') or (anchor.get('name') if anchor else None)}
        else:
            value = el.get_text(strip=True)
            if value and not re.fullmatch(r'\d{1,2}:\d{2}\s*(?:am|pm)', value) and not value.startswith('View the PC OA website'):
                paragraphs.append(value)
    flush()
    if not speeches and current is None and paragraphs:
        speeches.append({'speaker': '', 'party': '', 'electorate': '',
                         'speaker_type': 'unknown', 'chair_role': None,
                         'text': '\n\n'.join(paragraphs)})
    return speeches
