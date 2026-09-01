/* OPAX portal — vanilla JS, no build step. */

const $ = (id) => document.getElementById(id);

// --- tabs -------------------------------------------------------------------

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    for (const t of document.querySelectorAll(".tab")) {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", String(t === tab));
    }
    $("panel-ask").hidden = tab.dataset.panel !== "ask";
    $("panel-search").hidden = tab.dataset.panel !== "search";
  });
}

// --- helpers ----------------------------------------------------------------

function setStatus(el, message, isError = false) {
  el.hidden = !message;
  el.textContent = message || "";
  el.classList.toggle("error", isError);
}

function esc(s) {
  const d = document.createElement("span");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function metaLine(item) {
  return [item.speaker, item.party, item.state, item.date]
    .filter(Boolean)
    .join(" · ");
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// --- document viewer --------------------------------------------------------

async function openDoc(slug) {
  const dialog = $("doc-dialog");
  $("doc-title").textContent = "Loading…";
  $("doc-meta").textContent = "";
  $("doc-text").textContent = "";
  dialog.showModal();
  try {
    const doc = await api(`/api/resource/${encodeURIComponent(slug)}`);
    $("doc-title").textContent = doc.title;
    $("doc-meta").textContent = [doc.speaker, doc.metadata?.date, doc.url]
      .filter(Boolean)
      .join(" · ");
    $("doc-text").textContent = doc.text || "(no text)";
  } catch (err) {
    $("doc-title").textContent = "Could not load document";
    $("doc-meta").textContent = String(err.message || err);
  }
}
$("doc-close").addEventListener("click", () => $("doc-dialog").close());
$("doc-dialog").addEventListener("click", (e) => {
  if (e.target === $("doc-dialog")) $("doc-dialog").close();
});

function sourceButton(s) {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "link";
  btn.textContent = s.title || s.slug;
  btn.addEventListener("click", () => openDoc(s.slug));
  li.appendChild(btn);
  const meta = metaLine(s);
  if (meta) {
    const span = document.createElement("span");
    span.className = "source-meta";
    span.textContent = ` — ${meta}`;
    li.appendChild(span);
  }
  return li;
}

// --- ask --------------------------------------------------------------------

$("ask-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = $("ask-input").value.trim();
  if (!question) return;
  const button = e.target.querySelector("button");
  button.disabled = true;
  $("ask-answer").hidden = true;
  $("ask-sources").hidden = true;
  setStatus($("ask-status"), "Consulting the corpus… this can take up to a minute.");
  try {
    const data = await api("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    setStatus($("ask-status"), "");
    $("ask-answer").hidden = false;
    $("ask-answer").textContent = data.answer || "(no answer)";
    const list = $("ask-sources-list");
    list.replaceChildren(...(data.sources || []).map(sourceButton));
    $("ask-sources").hidden = !data.sources?.length;
  } catch (err) {
    setStatus($("ask-status"), String(err.message || err), true);
  } finally {
    button.disabled = false;
  }
});

// --- search -----------------------------------------------------------------

$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("search-input").value.trim();
  if (!q) return;
  const button = e.target.querySelector("button");
  button.disabled = true;
  setStatus($("search-status"), "Searching…");
  $("search-results").replaceChildren();
  try {
    const params = new URLSearchParams({
      q,
      kind: $("search-kind").value,
      mode: $("search-mode").value,
    });
    const data = await api(`/api/search?${params}`);
    setStatus(
      $("search-status"),
      data.count ? `${data.count} results` : "No results.",
    );
    $("search-results").replaceChildren(
      ...data.results.map((r) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div class="result-top">
            <button type="button" class="link">${esc(r.title)}</button>
            <span class="scorebar" title="relevance ${Math.round(r.score * 100)}%">
              <i style="width:${Math.round(r.score * 100)}%"></i>
            </span>
          </div>
          <div class="result-meta">${esc(metaLine(r))}</div>
          <p class="snippet">${esc(r.snippet)}</p>`;
        li.querySelector("button").addEventListener("click", () => openDoc(r.slug));
        return li;
      }),
    );
  } catch (err) {
    setStatus($("search-status"), String(err.message || err), true);
  } finally {
    button.disabled = false;
  }
});

// --- footer stats -----------------------------------------------------------

api("/api/stats")
  .then((s) => {
    $("stats").textContent =
      `${(s.resources ?? 0).toLocaleString()} documents · ` +
      `${(s.paragraphs ?? 0).toLocaleString()} passages indexed`;
  })
  .catch(() => {
    $("stats").textContent = "corpus loading…";
  });
