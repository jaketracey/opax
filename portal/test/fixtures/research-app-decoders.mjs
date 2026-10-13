// Extracted from the shipped iOS Ask decoder and SSE parser, 14 Oct 2026.
// Android uses the same React Native Ask decoder. See docs/design/research-loop.md.

// ../../../opax-ios/mobile/src/features/ask/model.ts
var object = (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
var str = (v) => typeof v === "string" ? v : "";
function decodeRanges(v) {
  return Array.isArray(v) ? v.filter(
    (r) => Array.isArray(r) && r.length === 2 && r.every((n) => Number.isSafeInteger(n) && n >= 0) && r[1] > r[0]
  ) : [];
}
function decodeAnswer(raw) {
  const v = object(raw);
  if (typeof v.answer !== "string" || !Array.isArray(v.sources))
    throw new Error("The answer could not be read.");
  const citations = Object.fromEntries(
    Object.entries(object(v.citations)).map(([k, r]) => [k, decodeRanges(r)])
  );
  const sources = v.sources.flatMap((rawSource) => {
    const s = object(rawSource);
    if (typeof s.resource !== "string" || typeof s.title !== "string")
      return [];
    const ranges = Object.entries(citations).filter(([k]) => k.split("/")[0] === s.resource).flatMap(([, r]) => r);
    const out2 = {
      resource: s.resource,
      title: s.title,
      slug: str(s.slug),
      href: str(s.href) || (str(s.slug) ? `/doc/${str(s.slug)}` : str(s.url)),
      snippet: str(s.snippet),
      cited: typeof s.cited === "boolean" ? s.cited : ranges.length > 0,
      answerRanges: ranges.length ? ranges : decodeRanges(s.answerRanges)
    };
    for (const k of [
      "speaker",
      "party",
      "date",
      "state",
      "url",
      "source"
    ])
      if (typeof s[k] === "string") out2[k] = s[k];
    return [out2];
  });
  const out = { answer: v.answer.trim(), citations, sources };
  for (const k of [
    "asked_as",
    "answer_status",
    "money_context",
    "money_overview",
    "money_question",
    "suggested_question"
  ])
    if (typeof v[k] === "string") out[k] = v[k];
  for (const k of ["money_ranking", "pay_answer"])
    if (typeof v[k] === "boolean") out[k] = v[k];
  if (Array.isArray(v.evidence_excerpts))
    out.evidence_excerpts = v.evidence_excerpts.flatMap((x) => {
      const e = object(x);
      return typeof e.resource === "string" && typeof e.text === "string" ? [{ resource: e.resource, text: e.text }] : [];
    });
  if (Array.isArray(v.pay_next))
    out.pay_next = v.pay_next.flatMap((x) => {
      const e = object(x);
      return typeof e.label === "string" && typeof e.href === "string" ? [{ label: e.label, href: e.href }] : [];
    });
  return out;
}

// ../../../opax-ios/mobile/src/features/ask/stream.ts
var AskFailure = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
  code;
};
var AskStream = class {
  constructor(on) {
    this.on = on;
  }
  on;
  buffer = "";
  final;
  completed = false;
  push(text, end = false) {
    this.buffer += text;
    let match;
    while (match = /\r?\n\r?\n/.exec(this.buffer)) {
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      this.dispatch(block);
    }
    if (end && this.buffer.trim()) {
      this.dispatch(this.buffer);
      this.buffer = "";
    }
  }
  dispatch(block) {
    if (this.completed) return;
    let event = "message";
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:"))
        data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length) return;
    let v;
    try {
      v = JSON.parse(data.join("\n"));
    } catch {
      return;
    }
    if (!v || typeof v !== "object") return;
    if (event === "done") {
      this.final = v;
      this.completed = true;
    } else if (event === "error")
      throw new AskFailure(
        "partial",
        typeof v.error === "string" ? v.error : "The answer stream failed."
      );
    else if (event === "delta" && typeof v.text === "string")
      this.on.delta(v.text);
    else if (event === "retry") {
      this.on.retry();
      this.on.stage("Reading the record again.");
    } else if (event === "status") {
      if (v.phase === "searching") this.on.stage("Searching the record");
      else if (["retrieved", "writing", "reading"].includes(String(v.phase)))
        this.on.stage("Writing the answer");
      if (v.phase === "retrieved" && Array.isArray(v.sources))
        this.on.reading?.(
          v.sources.flatMap((s) => s && typeof s.title === "string" ? [s.title] : []).slice(0, 3)
        );
    }
  }
  result() {
    if (!this.completed)
      throw new AskFailure("partial", "The answer stream ended early.");
    return this.final;
  }
};
export {
  AskStream,
  decodeAnswer
};
