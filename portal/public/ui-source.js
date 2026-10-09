/* SourceLine and MachineLabel sheets (docs/design/DESIGN-REVIEW-2026-10.md §5.2).
   Each is a <details class="ui-pop">: the browser already opens and closes it
   from its summary with a click, Enter or Space, and opens it in place when
   this script has not loaded. This adds what a popover needs on top:
   - Escape closes the open sheet and puts focus back on its line;
   - a click or tap outside closes it, and so does tabbing past a sheet that
     floats (a phone's sheet opens in place, so it stays until its line closes it);
   - one sheet is open at a time;
   - a floating sheet that would run off the right edge aligns to its line's end.
   Listeners sit on the document, so lines rendered later need no wiring. */
(() => {
  const POP = "details.ui-pop";

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
      if (e.key !== "Escape") return;
      const pop = e.target?.closest?.(`${POP}[open]`);
      if (!pop) return;
      e.preventDefault();
      e.stopPropagation();
      close(pop, { focus: true });
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
    return { close, align, onToggle, onKeydown, onClick, onFocusout };
  }

  window.opaxSourceLines = install(document, window);
})();
