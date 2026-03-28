"""
parli.ingest.photos — Download and cache MP headshots from official sources.

Strategy:
  1. Build a name->MPID mapping from APH's member directory (all parliaments)
  2. Match our database members to APH MPIDs by normalized name
  3. Download official portrait from /api/parliamentarian/{MPID}/image
  4. Resize to 200x200 and save as JPEG

Usage:
    # Download photos for top 200 most active MPs
    uv run python -m parli.ingest.photos --limit 200

    # Download for all MPs
    uv run python -m parli.ingest.photos --all

    # Force re-download even if photo exists
    uv run python -m parli.ingest.photos --limit 200 --force

    # Download for a specific person_id
    uv run python -m parli.ingest.photos --person-id 10007
"""

import argparse
import io
import json
import re
import sqlite3
import time
import unicodedata
from pathlib import Path

import requests
from PIL import Image

DB_PATH = Path("~/.cache/autoresearch/parli.db").expanduser()
PHOTOS_DIR = Path("~/.cache/autoresearch/photos").expanduser()
MPID_CACHE_PATH = PHOTOS_DIR / "_mpid_cache.json"

APH_SEARCH_URL = "https://www.aph.gov.au/Senators_and_Members/Parliamentarian_Search_Results"
APH_IMAGE_URL = "https://www.aph.gov.au/api/parliamentarian/{mpid}/image"

# Reusable session with browser-like headers
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
})

# Rate limiting: be polite to APH servers
REQUEST_DELAY = 1.0  # seconds between requests


def get_db():
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout = 600000")
    return db


def normalize_name(name: str) -> str:
    """Normalize a name for fuzzy matching: lowercase, strip titles/honorifics, ASCII-fold."""
    if not name:
        return ""
    # Remove accents
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    name = name.lower().strip()
    # Strip common titles/honorifics
    for title in ["hon ", "dr ", "mr ", "ms ", "mrs ", "senator ", "sen ", "mp", "am", "ao", "ac",
                   "the ", "rt ", "prof ", "qc", "sc", "oam", "obe", "cbe", "che"]:
        name = name.replace(title, " ")
    # Collapse whitespace and strip
    name = re.sub(r"\s+", " ", name).strip()
    return name


def build_aph_mpid_mapping() -> dict[str, str]:
    """
    Scrape APH member directory to build a normalized_name -> MPID mapping.
    Caches results to disk so we don't re-scrape every run.
    """
    if MPID_CACHE_PATH.exists():
        cache = json.loads(MPID_CACHE_PATH.read_text())
        age_hours = (time.time() - cache.get("timestamp", 0)) / 3600
        if age_hours < 168:  # Cache valid for 7 days
            print(f"  Using cached MPID mapping ({len(cache['mapping'])} entries, {age_hours:.0f}h old)")
            return cache["mapping"]

    print("  Building APH MPID mapping (scraping member directory)...")
    mapping = {}  # normalized_name -> MPID

    # Scrape current parliament first (ps=96 items per page)
    for sr in range(10):  # Up to 10 pages
        params = {
            "q": "",
            "mem": "1",
            "par": "-1",  # Current parliament
            "gen": "0",
            "ps": "96",
            "st": "1",
            "sr": str(sr),
        }
        try:
            resp = SESSION.get(APH_SEARCH_URL, params=params, timeout=30)
            resp.raise_for_status()
        except Exception as e:
            print(f"    [error] APH directory page {sr} failed: {e}")
            break

        # Extract MPID -> display name pairs
        pairs = re.findall(
            r'Parliamentarian\?MPID=([A-Za-z0-9]+)"[^>]*>([^<]+)</a>',
            resp.text,
        )
        if not pairs:
            break

        for mpid, display_name in pairs:
            norm = normalize_name(display_name)
            mapping[norm] = mpid

        print(f"    Page {sr}: {len(pairs)} members (total: {len(mapping)})")
        time.sleep(REQUEST_DELAY)

        # Check if we got fewer than page size (last page)
        total_match = re.search(r"of\s+(\d+)\s+results", resp.text)
        if total_match:
            total_expected = int(total_match.group(1))
            if len(mapping) >= total_expected:
                break

    # Also try to get former members from recent parliaments (47, 46, 45, 44)
    for par in ["47", "46", "45", "44", "43"]:
        for sr in range(10):
            params = {
                "q": "",
                "mem": "0",  # Former members only
                "par": par,
                "gen": "0",
                "ps": "96",
                "st": "1",
                "sr": str(sr),
            }
            try:
                resp = SESSION.get(APH_SEARCH_URL, params=params, timeout=30)
                resp.raise_for_status()
            except Exception as e:
                break

            pairs = re.findall(
                r'Parliamentarian\?MPID=([A-Za-z0-9]+)"[^>]*>([^<]+)</a>',
                resp.text,
            )
            if not pairs:
                break

            before = len(mapping)
            for mpid, display_name in pairs:
                norm = normalize_name(display_name)
                if norm not in mapping:
                    mapping[norm] = mpid
            print(f"    Parliament {par} page {sr}: {len(pairs)} members (+{len(mapping)-before} new, total: {len(mapping)})")
            time.sleep(REQUEST_DELAY)

    # Cache to disk
    MPID_CACHE_PATH.write_text(json.dumps({
        "timestamp": time.time(),
        "mapping": mapping,
    }))
    print(f"  Cached {len(mapping)} MPID mappings to {MPID_CACHE_PATH}")
    return mapping


def find_mpid(mpid_mapping: dict, first_name: str, last_name: str, full_name: str) -> str | None:
    """Try to find the APH MPID for a member using various name forms."""
    candidates = []
    if full_name:
        candidates.append(normalize_name(full_name))
    if first_name and last_name:
        candidates.append(normalize_name(f"{first_name} {last_name}"))
    if last_name and first_name:
        # Sometimes APH has "Lastname, Firstname" normalized differently
        candidates.append(normalize_name(f"{last_name} {first_name}"))

    for c in candidates:
        if c in mpid_mapping:
            return mpid_mapping[c]

    # Fuzzy: try matching just on last name if unique
    if last_name:
        norm_last = normalize_name(last_name)
        last_matches = {k: v for k, v in mpid_mapping.items() if norm_last in k.split()}
        if len(last_matches) == 1:
            return list(last_matches.values())[0]

    return None


def search_aph_mpid_live(first_name: str, last_name: str) -> str | None:
    """Fallback: search APH website live for an MP and return their MPID."""
    query = f"{first_name} {last_name}".strip()
    if not query:
        return None
    params = {
        "q": query,
        "mem": "1",
        "par": "-1",
        "gen": "0",
        "ps": "0",
        "st": "1",
    }
    try:
        resp = SESSION.get(APH_SEARCH_URL, params=params, timeout=15)
        resp.raise_for_status()
    except Exception:
        return None

    mpid_matches = re.findall(r"MPID=([A-Za-z0-9]+)", resp.text)
    return mpid_matches[0] if mpid_matches else None


def download_aph_photo(mpid: str) -> bytes | None:
    """Download official portrait from APH API."""
    url = APH_IMAGE_URL.format(mpid=mpid)
    try:
        resp = SESSION.get(url, timeout=15)
        if resp.status_code == 200 and len(resp.content) > 1000:
            return resp.content
    except Exception as e:
        print(f"    [error] APH image download failed for MPID={mpid}: {e}")
    return None


def download_openaustralia_photo(person_id: str) -> bytes | None:
    """Fallback: download photo from OpenAustralia and cache locally (stops hotlinking)."""
    # Try large version first, then small
    for path in [f"/images/mpsL/{person_id}.jpg", f"/images/mps/{person_id}.jpg"]:
        url = f"https://www.openaustralia.org.au{path}"
        try:
            resp = SESSION.get(url, timeout=15)
            if resp.status_code == 200 and len(resp.content) > 500:
                return resp.content
        except Exception:
            pass
    return None


def resize_and_save(image_bytes: bytes, output_path: Path, size: int = 200) -> bool:
    """Resize image to size x size square crop and save as JPEG."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img = img.convert("RGB")

        # Center crop to square
        w, h = img.size
        min_dim = min(w, h)
        left = (w - min_dim) // 2
        top = (h - min_dim) // 2
        img = img.crop((left, top, left + min_dim, top + min_dim))

        # Resize
        img = img.resize((size, size), Image.LANCZOS)
        img.save(str(output_path), "JPEG", quality=85)
        return True
    except Exception as e:
        print(f"    [error] Image processing failed: {e}")
        return False


def create_placeholder(output_path: Path, size: int = 200):
    """Create a simple grey silhouette placeholder."""
    img = Image.new("RGB", (size, size), color=(229, 231, 235))  # Tailwind gray-200

    try:
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        cx, cy = size // 2, size // 2

        # Head (circle)
        head_r = size // 6
        head_y = cy - size // 8
        draw.ellipse(
            [cx - head_r, head_y - head_r, cx + head_r, head_y + head_r],
            fill=(156, 163, 175),  # gray-400
        )

        # Shoulders (ellipse)
        shoulder_y = head_y + head_r + size // 16
        shoulder_w = size // 3
        shoulder_h = size // 4
        draw.ellipse(
            [cx - shoulder_w, shoulder_y, cx + shoulder_w, shoulder_y + shoulder_h],
            fill=(156, 163, 175),
        )
    except Exception:
        pass

    img.save(str(output_path), "JPEG", quality=85)


def download_photo_for_member(
    mpid_mapping: dict,
    person_id: str,
    first_name: str,
    last_name: str,
    full_name: str,
    force: bool = False,
) -> tuple[bool, str]:
    """Download and save photo for a single member.

    Returns (success, source) where source is 'aph', 'openaustralia', or ''.
    """
    output_path = PHOTOS_DIR / f"{person_id}.jpg"

    if output_path.exists() and not force:
        return True, "cached"

    photo_bytes = None
    source = ""

    # Step 1: Try APH official source via MPID mapping
    mpid = find_mpid(mpid_mapping, first_name or "", last_name or "", full_name or "")
    if mpid:
        photo_bytes = download_aph_photo(mpid)
        if photo_bytes:
            source = "aph"
        time.sleep(REQUEST_DELAY)

    # Step 2: Fallback to live APH search
    if not photo_bytes:
        mpid = search_aph_mpid_live(first_name or "", last_name or full_name or "")
        if mpid:
            photo_bytes = download_aph_photo(mpid)
            if photo_bytes:
                source = "aph"
        time.sleep(REQUEST_DELAY)

    # Step 3: Fallback to OpenAustralia (download and self-host, not hotlink)
    if not photo_bytes:
        photo_bytes = download_openaustralia_photo(person_id)
        if photo_bytes:
            source = "oa"
        time.sleep(REQUEST_DELAY)

    if not photo_bytes:
        return False, ""

    # Step 4: Resize and save
    ok = resize_and_save(photo_bytes, output_path)
    return ok, source if ok else ""


def main():
    parser = argparse.ArgumentParser(description="Download MP headshots from APH")
    parser.add_argument("--limit", type=int, default=200, help="Number of top MPs to download (default: 200)")
    parser.add_argument("--all", action="store_true", help="Download for all MPs")
    parser.add_argument("--force", action="store_true", help="Re-download even if photo exists")
    parser.add_argument("--person-id", type=str, help="Download for a specific person_id")
    parser.add_argument("--rebuild-cache", action="store_true", help="Force rebuild MPID cache")
    args = parser.parse_args()

    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

    # Create placeholder if it doesn't exist
    placeholder_path = PHOTOS_DIR / "placeholder.jpg"
    if not placeholder_path.exists():
        create_placeholder(placeholder_path)
        print(f"Created placeholder at {placeholder_path}")

    # Delete MPID cache if rebuild requested
    if args.rebuild_cache and MPID_CACHE_PATH.exists():
        MPID_CACHE_PATH.unlink()

    # Build name -> MPID mapping
    mpid_mapping = build_aph_mpid_mapping()

    db = get_db()

    if args.person_id:
        row = db.execute(
            "SELECT person_id, first_name, last_name, full_name FROM members WHERE person_id = ?",
            (args.person_id,),
        ).fetchone()
        if not row:
            print(f"No member found with person_id={args.person_id}")
            return
        members = [row]
    else:
        limit_clause = "" if args.all else f"LIMIT {args.limit}"
        members = db.execute(f"""
            SELECT m.person_id, m.first_name, m.last_name, m.full_name,
                   COUNT(s.speech_id) as speech_count
            FROM members m
            LEFT JOIN speeches s ON m.person_id = s.person_id
            WHERE m.person_id GLOB '[0-9]*'
            GROUP BY m.person_id
            ORDER BY speech_count DESC
            {limit_clause}
        """).fetchall()

    total = len(members)
    downloaded_aph = 0
    downloaded_oa = 0
    skipped = 0
    failed = 0
    failed_names = []

    print(f"\nProcessing {total} members...")
    print(f"Photos will be saved to: {PHOTOS_DIR}")
    print()

    for i, m in enumerate(members, 1):
        pid = m["person_id"]
        name = m["full_name"] or f"{m['first_name']} {m['last_name']}"
        output_path = PHOTOS_DIR / f"{pid}.jpg"

        if output_path.exists() and not args.force:
            skipped += 1
            continue

        print(f"[{i}/{total}] {name} (person_id={pid})...", end=" ", flush=True)

        ok, source = download_photo_for_member(
            mpid_mapping, pid, m["first_name"], m["last_name"], m["full_name"],
            force=args.force,
        )

        if ok:
            if source == "aph":
                downloaded_aph += 1
                print("OK (APH)")
            elif source == "oa":
                downloaded_oa += 1
                print("OK (OpenAustralia)")
            else:
                skipped += 1
                print("OK (cached)")
        else:
            failed += 1
            failed_names.append(f"{name} ({pid})")
            print("FAILED")

    photos_on_disk = len([p for p in PHOTOS_DIR.glob("[0-9]*.jpg")])
    print()
    print(f"Done. APH: {downloaded_aph}, OpenAustralia: {downloaded_oa}, "
          f"Skipped: {skipped}, Failed: {failed}")
    print(f"Total MP photos on disk: {photos_on_disk}")

    if failed_names and len(failed_names) <= 30:
        print(f"\nFailed members:")
        for fn in failed_names:
            print(f"  - {fn}")


if __name__ == "__main__":
    main()
