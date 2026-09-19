/* Shared keyboard-accessible suggestions and header search disclosure. */
(() => {
function attachQuickSearch(input, panel, { idPrefix, beforeGo, source, enterFallback = "search", clearOnGo = true, navigate, searchHref } = {}) {
  if (!input || !panel) return;
  let items = [];
  let active = -1;
  let seq = 0;
  let debounce = null;
  const prefix = idPrefix || "ms";
  const close = () => {
    seq++;
    clearTimeout(debounce);
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    active = -1;
  };
  const go = (href) => {
    close();
    if (clearOnGo) input.value = "";
    input.blur();
    beforeGo?.();
    navigate(href);
  };
  const render = () => {
    panel.replaceChildren(...items.map((it, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ms-row" + (i === active ? " ms-active" : "");
      b.setAttribute("role", "option");
      b.id = `${prefix}-opt-${i}`;
      b.setAttribute("aria-selected", String(i === active));
      const t = document.createElement("span");
      t.textContent = it.label;
      const k = document.createElement("span");
      k.className = "ms-type";
      k.textContent = it.type;
      b.append(t, k);
      // pointerdown beats the input's blur; click would arrive too late.
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); go(it.href); });
      return b;
    }));
    panel.hidden = !items.length;
    input.setAttribute("aria-expanded", String(items.length > 0));
    input.setAttribute("aria-activedescendant", active >= 0 ? `${prefix}-opt-${active}` : "");
  };
  const suggest = async () => {
    const q = input.value.trim();
    const my = ++seq;
    if (q.length < 2) { items = []; render(); return; }
    const out = await source(q);
    if (my !== seq) return;
    items = (out || []).slice(0, 10);
    active = -1;
    render();
  };
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(suggest, 120);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault(); active = (active + 1) % items.length; render();
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault(); active = (active - 1 + items.length) % items.length; render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && items[active]) go(items[active].href);
      else if (enterFallback === "search" && input.value.trim()) go(searchHref(input.value.trim()));
      else close();
    } else if (e.key === "Escape" && !panel.hidden) {
      e.stopPropagation(); close();
    }
  });
  input.addEventListener("focus", () => { if (items.length) { panel.hidden = false; input.setAttribute("aria-expanded", "true"); } });
  document.addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== input) close();
  });
  return { close, go };
}

function disclosure(toggle, panel, input) {
  const close = (restoreFocus = false) => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus();
  };
  toggle.addEventListener('click', () => {
    if (!panel.hidden) return close(true);
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.contains(event.target) && !toggle.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); }
  });
  document.addEventListener('focusin', event => {
    if (!panel.contains(event.target) && !toggle.contains(event.target)) close();
  });
  return { close };
}
globalThis.OpaxQuickSearch = { attach: attachQuickSearch, disclosure };
})();
