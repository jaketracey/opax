/* global expect, afterAll, __dirname */
// Shared by raw renderer and Testing Library screen tests. Inspect before
// unmount, then fail after cleanup so even a failed audit releases listeners.
const results = [];
const exceptions = require('./screen-a11y-exceptions.cjs');
let current = [];

function auditTree(tree, platform) {
  let root;
  try {
    root = tree.root;
  } catch {
    return;
  } // Explicitly unmounted already.
  const inventory = globalThis.screenA11yInventory ?? [];
  const types = new Map();
  for (const item of inventory) {
    const loaded = require.cache[item.file]?.exports;
    if (!loaded) continue;
    for (const entry of item.exports) {
      const type = loaded[entry.exported];
      if (!type) continue;
      const id = item.file.replace(/^.*\/mobile\//, '') + '#' + entry.exported;
      for (const candidate of [type, type.type, type.render].filter(Boolean)) {
        const previous = types.get(candidate);
        types.set(candidate, {
          screen: previous?.screen.implementation ? previous.screen : item,
          ids: [...(previous?.ids ?? []), id],
        });
      }
    }
  }
  const visit = (node) => {
    const screen = types.get(node.type)?.screen;
    if (screen && node.findAll((n) => typeof n.type === 'string').length) {
      const { auditAccessibility } = require('./screen-a11y');
      const { Link } = require('expo-router');
      const swiftUI = require('@expo/ui/swift-ui');
      const issues = auditAccessibility(node, {
        platform,
        nativeTitle: screen.nativeTitle,
        link: Link,
        linkTrigger: Link?.Trigger,
        nativeMenus: [Link?.Menu, Link?.MenuAction, Link?.Preview].filter(
          Boolean,
        ),
        nativeButtons: [swiftUI?.Button].filter(Boolean),
      });
      const file = screen.file.replace(/^.*\/mobile\//, '');
      for (const issue of issues) {
        const exception = exceptions.find(
          (entry) =>
            entry.screens.includes(file) &&
            entry.rule === issue.rule &&
            entry.element === issue.element &&
            entry.detail === issue.detail,
        );
        if (exception) issue.designDecision = exception.reason;
      }
      const result = {
        screen: file,
        components: [
          ...new Set(
            node
              .findAll((child) => types.has(child.type))
              .flatMap((child) => types.get(child.type).ids),
          ),
        ],
        platform,
        test: expect.getState().currentTestName,
        issues,
      };
      current.push(result);
      results.push(result);
      return;
    }
    for (const child of node.children)
      if (typeof child !== 'string') visit(child);
  };
  visit(root);
}
function finishAudit() {
  const failures = current.flatMap(({ screen, issues }) =>
    issues
      .filter((issue) => !issue.designDecision)
      .map((issue) => ({ screen, ...issue })),
  );
  current = [];
  if (failures.length)
    throw new Error(
      'Screen accessibility audit:\n' +
        failures
          .slice(0, 20)
          .map((f) => `${f.screen}: ${f.rule}: ${f.element}: ${f.detail}`)
          .join('\n') +
        (failures.length > 20
          ? `\n... ${failures.length} findings (full report in node_modules/.cache/screen-a11y)`
          : ''),
    );
}
afterAll(() => {
  if (!results.length) return;
  const fs = require('node:fs');
  const path = require('node:path');
  const directory = path.join(__dirname, '../node_modules/.cache/screen-a11y');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, path.basename(expect.getState().testPath) + '.json'),
    JSON.stringify(results, null, 2),
  );
});
module.exports = { auditTree, finishAudit };
