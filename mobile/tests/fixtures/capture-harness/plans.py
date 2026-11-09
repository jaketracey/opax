"""Frozen wave 9 capture helper contract, copied on 10 November 2026.

Only the helpers exercised by qa-harness.test.ts are retained from
private/apple-design/harness/plans.py. No driver, device or ignored path is
loaded. Update this committed contract alongside reviewed harness changes.
"""
import asyncio
import json
import re
import time


def normal_text(text):
    return " ".join(text.replace("’", "'").replace("“", '"').replace("”", '"').split()).casefold()


def title_matches(text, title):
    value, expected = normal_text(text), normal_text(title)
    if value == expected:
        return True
    # Long inline titles can truncate beside a named Back button and two
    # trailing items, for example Parliamentari... in the saved directory.
    prefix = value.rstrip(".…")
    return value != prefix and len(prefix) >= 6 and expected.startswith(prefix)


async def tap_text(d, label, attempts=3, words=False):
    """Native UIKit labels can be drawn but absent from idb's flat tree."""
    if isinstance(d, _Null):
        return True
    for _ in range(attempts):
        matches = [el for el in await d.elements() if d.on_screen(el)
                   and normal_text(el.get("AXLabel") or "") == normal_text(label)]
        # A lower sheet's Done takes precedence over background chrome.
        matches.sort(key=lambda el: d.frame(el)[1], reverse=label == "Done")
        if matches:
            el = matches[0]
            x, y, w, h = d.frame(el)
            await d.tap_xy(x + w / 2, y + h / 2)
            return True
        for text, x, y, w, h in d.ocr():
            value, target = normal_text(text).removeprefix("q "), normal_text(label)
            if value == target:
                await d.tap_xy(x + w / 2, y + h / 2)
                return True
            # Vision sometimes groups all four scope segments, or the sheet
            # title and Done, into one line. Tap the matching word's bounds.
            match = re.search(r"(?<!\w)" + re.escape(target) + r"(?!\w)", value)
            if match and (words or label == "Done"):
                await d.tap_xy(x + w * (match.start() + len(target) / 2) / len(value), y + h / 2)
                return True
        await d.pause(0.4)
    return False


async def present(d, test_id, label, timeout=15):
    """Use a visible heading when idb omits the screen container's id."""
    if await d.wait(test_id, timeout=timeout):
        return True
    if isinstance(d, _Null):
        return True
    return any(normal_text(text) == normal_text(label) for text, *_ in d.ocr())


async def native_search(d, text, placeholder, previous=""):
    """Focus by native role/AXValue, or by the drawn field's OCR bounds.

    idb may omit UISearchTextField altogether. Only send text after a field
    was found, and clear the previous query with the cursor at its end.
    """
    if isinstance(d, _Null):
        return True
    await d.settle()
    targets = {normal_text(placeholder), normal_text(previous)} - {""}
    for attempt in range(5):
        elements = [el for el in await d.elements() if d.on_screen(el)]
        # The bottom UISearchTextField can be exposed as a button whose
        # AXLabel is the placeholder. Prefer that exact field over roles
        # belonging to another text input or a hidden search controller.
        fields = [el for el in elements if any(
            normal_text(el.get(key) or "") in targets for key in ("AXLabel", "AXValue"))]
        if not fields:
            fields = [el for el in elements if any(
                "searchfield" in re.sub(r"[^a-z]", "", str(el.get(key, "")).lower())
                for key in ("type", "role", "role_description"))]
        if not fields:
            text_fields = [el for el in elements if any(
                "textfield" in re.sub(r"[^a-z]", "", str(el.get(key, "")).lower())
                for key in ("type", "role", "role_description"))]
            if len(text_fields) == 1:
                fields = text_fields
        focused = False
        if fields:
            field = fields[0]
            x, y, w, h = d.frame(field)
            await d.tap_xy(x + w / 2, y + h / 2)
            value = field.get("AXValue") or ""
            previous = value if value and normal_text(value) != normal_text(placeholder) else previous
            focused = True
        else:
            focused = await tap_text(d, previous or placeholder, attempts=1)
        if focused:
            # Activation can move the native field from the bottom bar to
            # above the keyboard. Let that transition finish before input.
            await d.settle()
            if previous:
                clear = next((el for el in await d.elements()
                              if d.on_screen(el) and (el.get("AXLabel") or "").lower()
                              in ("clear text", "clear search text", "clear")), None)
                if clear:
                    cx, cy, cw, ch = d.frame(clear)
                    await d.tap_xy(cx + cw / 2, cy + ch / 2)
                else:
                    # USB HID 79 is Right Arrow. A field tap can put the cursor
                    # mid-query; move to its end before deleting all characters.
                    for _ in previous:
                        await d.hid("right", lambda: d.c.key(79))
                    await d.erase(len(previous) + 1)
            await d.text(text)
            await d.settle()
            if any(normal_text(el.get("AXValue") or "") == normal_text(text)
                   for el in await d.elements() if d.on_screen(el)) or any(
                       re.search(r"(?<!\w)" + re.escape(normal_text(text)) + r"(?!\w)", normal_text(line))
                       for line, *_ in d.ocr()):
                return True
            d.note(f"native search query was not displayed: {text}")
            return False
        if attempt < 4:
            await d.swipe(0.32, 0.78, 0.6)
    d.note(f"native search field not found: {placeholder}")
    return False


async def bar_action(d, label, top=None, trailing=0, title=None):
    """Restore chrome, then use AX/OCR or the native nav bar's own frame.

    idb drops iOS 27 native bar-item children. Icon slots are measured from
    the bar: rightmost centre 40 pt from its edge, then 56 pt per item.
    """
    if top:
        await d.scroll_to_top(top)
        await d.swipe(0.30, 0.75, 0.6)
    # Native header items now carry ids. Prefer their actual hit frames,
    # including when UIKit exports an icon without an accessibility label.
    header_id = ("header-more" if label.startswith("More for ") else
                 {"Filters": "header-filters", "Account": "header-account"}.get(label))
    if header_id:
        item = await d.find(header_id)
        if item and d.on_screen(item):
            x, y, w, h = d.frame(item)
            await d.tap_xy(x + w / 2, y + h / 2)
            return True
    if await tap_text(d, label):
        return True
    if label == "Filters" and await tap_text(d, "Filters, on", attempts=1):
        return True
    if not (label.startswith("More for ") or label in ("Filters", "Account", "Done", "Not now")):
        return False
    bars = [el for el in await d.elements() if d.on_screen(el)
            and any(re.sub(r"[^a-z]", "", str(el.get(key, "")).lower())
                    in ("navbar", "navigationbar", "axnavigationbar")
                    for key in ("type", "role", "role_description"))
            and 0 < d.frame(el)[3] <= 120]
    if bars:
        x, y, w, h = d.frame(max(bars, key=lambda el: d.frame(el)[1]))
        await d.tap_xy(x + w - 40 - 56 * trailing, y + h / 2)
        return True
    # idb can omit the entire bar, not just its children. Anchor the icon
    # slots to the drawn navigation title rather than a fixed screen y.
    titles = [title] if title else (["Sources", "Filters", "Citation 1", "How this is chosen"]
                                  if label == "Done" else [])
    headings = [(y, h) for text, _, y, _, h in d.ocr()
                if any(title_matches(text, t) for t in titles)
                and 40 < y < d.height - 80]
    if headings:
        y, h = max(headings)
        await d.tap_xy(d.width - 40 - 56 * trailing, y + h / 2)
        return True
    d.note(f"bar action not reached: {label}")
    return False


async def search_scope(d, label):
    if isinstance(d, _Null):
        return True
    for _ in range(8):
        target = f"search-scope-{label.lower()}"
        if await d.find(target):
            return await d.tap(target)
        # At Large, the SwiftUI picker may export neither its id nor each
        # segment as an element. Require the scope labels in one horizontal
        # band so a result mentioning speeches cannot masquerade as a scope.
        lines = d.ocr()
        for text, x, y, w, h in lines:
            value = normal_text(text)
            match = re.search(r"(?<!\w)" + re.escape(normal_text(label)) + r"(?!\w)", value)
            band = " ".join(normal_text(line) for line, _, py, _, ph in lines
                            if abs((py + ph / 2) - (y + h / 2)) < 24)
            peers = sum(bool(re.search(r"(?<!\w)" + scope + r"(?!\w)", band))
                        for scope in ("all", "people", "bills", "speeches"))
            if match and peers >= 3:
                await d.tap_xy(x + w * (match.start() + len(label) / 2) / len(value), y + h / 2)
                return True
        if await d.find("search-scope-menu"):
            await d.tap("search-scope-menu")
            return await tap_text(d, label, words=True)
        if await tap_text(d, "All", attempts=1, words=True):
            if await tap_text(d, label, words=True):
                return True
        # The scope is above search-count. Restore the scope itself, not
        # the count which can be visible while the picker is clipped.
        await d.swipe(0.30, 0.78, 0.6)
    d.note(f"search scope not reached: {label}")
    return False


async def close_sheet(d, title=None):
    if not await bar_action(d, "Done", title=title):
        return False
    if title and not isinstance(d, _Null):
        await d.settle()
        if any(normal_text(text) == normal_text(title) for text, *_ in d.ocr()):
            d.note(f"sheet did not close: {title}")
            return False
    return True


async def open_sources(d, test_id, label):
    """Do not capture a source sheet until its own content is visible."""
    if isinstance(d, _Null):
        return True
    for _ in range(2):
        if not await d.scroll_to(test_id):
            return False
        await d.settle()
        # Source lines hug their text. OCR of the publisher is an alternate
        # target if idb's wrapper frame does not hit the native Pressable.
        if not await tap_text(d, label, attempts=1, words=True):
            await d.tap(test_id)
        if await present(d, f"{test_id}-sheet-original-0", "Sources"):
            return True
    return False


async def open_citation(d):
    """Use the inline mark, or the cited row's Show passage menu.

    The native sheet has no bar title. citation-title is inside a combined
    accessible heading, so idb can omit it while exporting citation-passage.
    """
    if isinstance(d, _Null):
        return True
    if await d.scroll_to_top("ask-citation-mark-1", max_swipes=6):
        if await d.tap("ask-citation-mark-1") and await citation_present(d):
            return True
    if not await d.scroll_to_top("ask-citation-1"):
        return False
    row = await d.find("ask-citation-1")
    if not row:
        return False
    x, y, w, h = d.frame(row)
    await d.hid("citation menu", lambda: d.c.tap(x=x + w / 2, y=y + h / 2, duration=0.8))
    if not await tap_text(d, "Show passage"):
        return False
    return await citation_present(d)


async def citation_present(d):
    if await d.wait("citation-passage", timeout=15):
        return True
    elements = [el for el in await d.elements() if d.on_screen(el)]
    return any(el.get("AXUniqueId") in ("citation-title", "citation-no-passage") or
               (el.get("AXLabel") or "").startswith("Source 1, ") for el in elements) or any(
                   normal_text(text) == normal_text("This record has no passage to show.")
                   for text, *_ in d.ocr())


async def choose_grayndler(d):
    """Wait for the persisted choice and chooser dismissal before routing.

    Choosing shows a checkmark briefly before closing the modal. Opening a
    tab during that transition can leave the chooser above the destination.
    """
    row = "seat-row-federal-representatives-nsw-grayndler"
    if not await d.tap(row) or not await d.wait_gone(row, timeout=30):
        d.note("Grayndler chooser did not finish saving and closing")
        return False
    await d.settle()
    await d.link("opax://your-mp")
    await d.scroll_to_top("your-seat-name", max_swipes=6)
    await d.wait("your-seat-name", timeout=30)
    if isinstance(d, _Null):
        return True
    # Text can be drawn without its testID in idb. Confirm the actual saved
    # electorate, rather than accepting a screen container or another seat.
    expected = normal_text("Grayndler, New South Wales")
    chosen = any(normal_text(el.get("AXLabel") or "") == expected
                 for el in await d.elements() if d.on_screen(el)) or any(
                     normal_text(text) == expected for text, *_ in d.ocr())
    if not chosen:
        await d.dump("your-mp-seat-not-confirmed")
        d.note("Your MP did not show the saved Grayndler electorate")
    return chosen


async def cold_account(d, now=time.monotonic):
    """Sample Account for 10 s on a cold launch of the warm installed app.

    Warm the installed build first, then terminate/relaunch via launch().
    Deliberately never call reset(), uninstall or install here.
    """
    args = ("-OPAXEditionAge", "fresh", "-OPAXEditionCache", "present")
    d.launch(*args)
    await d.link("opax://")
    if not await d.wait("today-screen-message", timeout=60) and not (
            await d.find("header-account") or await d.find(label="Account")):
        raise RuntimeError("Account probe could not warm the installed app")
    await d.settle()
    d.launch(*args)
    start, samples = now(), []
    while now() - start < 10:
        try:
            elements = await asyncio.wait_for(d.elements(), timeout=10 - (now() - start))
        except asyncio.TimeoutError:
            d.note("Account accessibility read exceeded the sample window")
            samples.append({"elapsed": round(now() - start, 3), "frames": []})
            break
        frames = [d.frame(el) for el in elements if d.on_screen(el) and
                  (el.get("AXUniqueId") == "header-account" or el.get("AXLabel") == "Account")]
        samples.append({"elapsed": round(now() - start, 3), "frames": frames})
        await d.pause(min(0.25, max(0, 10 - (now() - start))))
    result = {"windowSeconds": 10, "elapsedSeconds": round(now() - start, 3),
              "reinstalled": False, "samples": samples}
    (d.evidence / "w9-account-geometry.json").write_text(json.dumps(result, indent=1) + "\n")
    await d.dump("w9-cold-account")
    await d.shot("w9-cold-account")
    if not any(sample["frames"] for sample in samples):
        raise RuntimeError("Account had no measurable frame in the 10 s window")


class _Null:
    """Stands in for a device so `python3 plans.py` can list every id."""

    def __getattr__(self, name):
        async def coro(*a, **k):
            return True
        if name in ("launch", "reset", "note"):
            return lambda *a, **k: None
        if name == "find":
            async def none(*a, **k):
                return None
            return none
        return coro
