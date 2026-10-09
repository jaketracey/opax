/* SourceLine, MachineLabel and ⋯ sheets (docs/design/DESIGN-REVIEW-2026-10.md §5.2).
   Each is a <details class="ui-pop">: the browser already opens and closes it
   from its summary with a click, Enter or Space, and opens it in place when
   this script has not loaded. This adds what a popover needs on top:
   - Escape closes the open sheet and puts focus back on its line;
   - a click or tap outside closes it, and so does tabbing past a sheet that
     floats (a phone's sheet opens in place, so it stays until its line closes it);
   - one sheet is open at a time;
   - a floating sheet that would run off the right edge aligns to its line's end;
   - in ⋯ (details.ui-more) the arrow keys move between its items, Home and
     End go to the ends, and an arrow on its closed circle opens it at an end.
   Listeners sit on the document, so lines rendered later need no wiring. */
(() => {
  const POP = "details.ui-pop";
  const MENU = "details.ui-more";
  const MOVES = ["ArrowDown", "ArrowUp", "Home", "End"];

  function install(doc, win) {
    const sheetOf = (pop) => [...pop.children].find((el) => el.classList?.contains("ui-sheet"));
    const summaryOf = (pop) => [...pop.children].find((el) => el.tagName === "SUMMARY");
    const floats = (pop) => {
      const sheet = sheetOf(pop);
      return !!sheet && win.getComputedStyle(sheet).position === "absolute";
    };

    function close(pop, { focus = false } = {}) {
      pop.open = false;
      if (focus) summaryOf(pop)?.focus({ preventScroll: true });
    }

    function align(pop) {
      delete pop.dataset.align;
      const sheet = sheetOf(pop);
      if (!sheet || !floats(pop)) return;
      const line = pop.getBoundingClientRect();
      const width = sheet.getBoundingClientRect().width;
      if (line.left + width > win.innerWidth - 16 && line.right - width >= 16) pop.dataset.align = "end";
    }

    // toggle does not bubble: it is heard on the way down.
    function onToggle(e) {
      const pop = e.target;
      if (!pop?.matches?.(POP) || !pop.open) return;
      for (const other of doc.querySelectorAll(`${POP}[open]`)) {
        if (other !== pop && !other.contains(pop) && !pop.contains(other)) close(other);
      }
      align(pop);
    }

    // Heard before the page's own Escape handlers (the docked assistant closes
    // on Escape too): the innermost thing open closes first.
    function onKeydown(e) {
      if (MOVES.includes(e.key)) return move(e);
      if (e.key !== "Escape") return;
      const pop = e.target?.closest?.(`${POP}[open]`);
      if (!pop) return;
      e.preventDefault();
      e.stopPropagation();
      close(pop, { focus: true });
    }

    // ⋯ is a short menu of links and buttons. Tab still walks it; the arrows
    // are the menu's own way through, wrapping at the ends.
    function move(e) {
      const menu = e.target?.closest?.(MENU);
      if (!menu) return;
      const items = [...(sheetOf(menu)?.querySelectorAll("a[href], button:not([disabled])") || [])];
      if (!items.length) return;
      const onLine = e.target === summaryOf(menu);
      if (onLine && !menu.open && !["ArrowDown", "ArrowUp"].includes(e.key)) return;
      e.preventDefault();
      if (!menu.open) menu.open = true;
      const at = items.indexOf(e.target);
      const last = items.length - 1;
      const next = e.key === "Home" ? 0 : e.key === "End" ? last
        : at < 0 ? (e.key === "ArrowUp" ? last : 0)
        : e.key === "ArrowDown" ? (at === last ? 0 : at + 1) : (at === 0 ? last : at - 1);
      items[next].focus();
    }

    function onClick(e) {
      for (const pop of doc.querySelectorAll(`${POP}[open]`)) {
        if (!pop.contains(e.target)) close(pop);
      }
    }

    // Only a move to another element closes it: a click on the sheet's own
    // text sends focus nowhere (relatedTarget null) and must not.
    function onFocusout(e) {
      const pop = e.target?.closest?.(`${POP}[open]`);
      const next = e.relatedTarget;
      if (!pop || !next || pop.contains(next) || !floats(pop)) return;
      close(pop);
    }

    doc.addEventListener("toggle", onToggle, true);
    doc.addEventListener("keydown", onKeydown, true);
    doc.addEventListener("click", onClick, true);
    doc.addEventListener("focusout", onFocusout);
    return { close, align, move, onToggle, onKeydown, onClick, onFocusout };
  }

  window.opaxSourceLines = install(document, window);
})();
