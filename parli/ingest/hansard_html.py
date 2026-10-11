"""The established OpenAustralia HTML -> JSONL speech parser."""
import re
from bs4 import BeautifulSoup

def parse_debate_html(html: str) -> list[dict]:
    """
    Parse a debate page HTML to extract complete speeches.

    Returns a list of dicts with keys: speaker, party, electorate, text.
    This is the exact same logic as scrape_debate_page() in the sync version.
    """
    soup = BeautifulSoup(html, "html.parser")
    speeches = []

    main = soup.find("div", class_="main")
    if not main:
        return speeches

    children = list(main.children)

    current_speaker = ""
    current_party = ""
    current_electorate = ""
    current_paragraphs = []

    def _flush():
        if current_paragraphs:
            text = "\n\n".join(current_paragraphs)
            if text.strip():
                speeches.append(
                    {
                        "speaker": current_speaker,
                        "party": current_party,
                        "electorate": current_electorate,
                        "text": text,
                    }
                )

    for el in children:
        if not hasattr(el, "name") or el.name is None:
            continue

        if el.name == "p" and "speaker" in (el.get("class") or []):
            _flush()
            current_paragraphs = []

            strong = el.find("strong")
            current_speaker = strong.get_text(strip=True) if strong else ""

            current_party = ""
            current_electorate = ""
            small = el.find("small")
            if small:
                small_text = small.get_text(strip=True)
                paren = re.search(r"\(([^)]+)\)", small_text)
                if paren:
                    parts = [p.strip() for p in paren.group(1).split(",")]
                    if len(parts) >= 2:
                        current_electorate = parts[0]
                        current_party = parts[1]
                    elif len(parts) == 1:
                        current_party = parts[0]

            inner_ps = el.find_all("p")
            for ip in inner_ps:
                ip_classes = ip.get("class") or []
                if "speaker" in ip_classes:
                    continue
                ip_text = ip.get_text(strip=True)
                if ip_text:
                    current_paragraphs.append(ip_text)

            continue

        if el.name == "p":
            el_text = el.get_text(strip=True)
            if re.match(r"^\d{1,2}:\d{2}\s*(am|pm)$", el_text):
                continue
            if el_text:
                current_paragraphs.append(el_text)

    _flush()

    if not speeches:
        all_ps = main.find_all("p")
        all_text = "\n\n".join(
            p.get_text(strip=True)
            for p in all_ps
            if p.get_text(strip=True) and "speaker" not in (p.get("class") or [])
        )
        if all_text:
            speeches.append(
                {
                    "speaker": "",
                    "party": "",
                    "electorate": "",
                    "text": all_text,
                }
            )

    return speeches
