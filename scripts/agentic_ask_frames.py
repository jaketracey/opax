#!/usr/bin/env python3
"""Tool-calling behaviour of the design (ii) runs, from the saved websocket frames
(portal/private/agentic-ask-spike/frames/*.ndjson): identical repeated calls,
iteration-cap hits, tool errors, MCP calls. Writes frames-summary.json beside them."""
import collections, glob, json, os, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'portal', 'private', 'agentic-ask-spike')
prefix = sys.argv[1] if len(sys.argv) > 1 else 'ii_opax-spike-agent-mcp-'
rows = []
for path in sorted(glob.glob(os.path.join(root, 'frames', prefix + '*.ndjson'))):
    qid = os.path.basename(path)[len(prefix):-len('.ndjson')]
    if '-' in qid and not qid[0].isdigit(): continue  # another config sharing the prefix
    steps = []
    for line in open(path):
        try: f = json.loads(line)
        except Exception: continue
        if f.get('step'): steps.append(f['step'])
    calls = [s.get('value', '') for s in steps if s.get('module') == 'smart' and str(s.get('value', '')).startswith('Tool calls:')]
    fns = collections.Counter(c.split('(')[0].replace('Tool calls: ', '') for c in calls)
    repeats = len(calls) - len(set(calls))
    errors = [f"{s.get('title')}: {str(s.get('reason') or s.get('error'))[:140]}" for s in steps if 'error' in str(s.get('title', '')).lower() or 'ToolError' in str(s.get('value', '')) or s.get('error')]
    rows.append({'id': qid, 'tool_calls': len(calls), 'distinct_calls': len(set(calls)), 'repeated_identical': repeats,
                 'max_iterations': any('max iterations' in str(s.get('reason', '')) for s in steps),
                 'functions': dict(fns), 'mcp_calls': sum(n for f, n in fns.items() if 'mcp' in f), 'errors': errors,
                 'skipped': sum('SkippedToolCall' in str(s.get('value', '')) for s in steps)})
summary = {
    'runs': len(rows),
    'runs_with_identical_repeat': sum(r['repeated_identical'] > 0 for r in rows),
    'identical_repeats': sum(r['repeated_identical'] for r in rows),
    'runs_hitting_max_iterations': sum(r['max_iterations'] for r in rows),
    'runs_with_tool_error': sum(bool(r['errors']) for r in rows),
    'tool_calls': sum(r['tool_calls'] for r in rows),
    'mcp_calls': sum(r['mcp_calls'] for r in rows),
    'runs_using_mcp': sum(r['mcp_calls'] > 0 for r in rows),
    'functions': dict(sum((collections.Counter(r['functions']) for r in rows), collections.Counter())),
    'error_kinds': dict(collections.Counter(e.split(':')[0] + ':' + e.split(':', 2)[-1][:70] for r in rows for e in r['errors'])),
}
json.dump({'summary': summary, 'rows': rows}, open(os.path.join(root, f'frames-summary-{prefix.rstrip("-")}.json'), 'w'), indent=1)
print(json.dumps(summary, indent=1))
