const fs = require('node:fs');
const path = require('node:path');
const { screenInventory } = require('./screen-a11y-inventory.cjs');

class ScreenA11yReporter {
  constructor(config) {
    this.config = config;
    this.directory = path.join(
      config.rootDir,
      'node_modules/.cache/screen-a11y',
    );
  }
  onRunStart() {
    fs.mkdirSync(this.directory, { recursive: true });
    // Only this reporter's own JSON reports, never another lane's artifacts.
    for (const file of fs.readdirSync(this.directory))
      if (file.endsWith('.json'))
        fs.unlinkSync(path.join(this.directory, file));
  }
  onRunComplete() {
    const rows = fs
      .readdirSync(this.directory)
      .filter(
        (file) =>
          file.endsWith('.test.ts.json') || file.endsWith('.test.tsx.json'),
      )
      .flatMap((file) =>
        JSON.parse(fs.readFileSync(path.join(this.directory, file), 'utf8')),
      );
    const covered = new Set(rows.map((row) => row.screen));
    const inventory = screenInventory(this.config.rootDir).filter(
      (entry) => entry.implementation,
    );
    const expected = inventory.map((entry) =>
      path.relative(this.config.rootDir, entry.file),
    );
    const missing = expected.filter((file) => !covered.has(file));
    const coveredComponents = new Set(
      rows.flatMap((row) => row.components ?? []),
    );
    const expectedComponents = inventory.flatMap((entry) =>
      entry.exports.map(
        (component) =>
          path.relative(this.config.rootDir, entry.file) +
          '#' +
          component.exported,
      ),
    );
    const missingComponents = expectedComponents.filter(
      (component) => !coveredComponents.has(component),
    );
    const issues = new Map();
    for (const row of rows)
      for (const issue of row.issues)
        issues.set(
          JSON.stringify([row.screen, issue.rule, issue.element, issue.detail]),
          { screen: row.screen, ...issue },
        );
    const summary = {
      screens: [...covered].sort(),
      expected,
      missing,
      expectedComponents,
      missingComponents,
      renders: rows.length,
      findings: [...issues.values()],
    };
    fs.writeFileSync(
      path.join(this.directory, 'summary.json'),
      JSON.stringify(summary, null, 2),
    );
    // Focused runs remain useful; the full gate must cover every implementation.
    const focused =
      this.config.runTestsByPath ||
      this.config.testPathPattern ||
      this.config.testNamePattern ||
      this.config.onlyChanged ||
      this.config.findRelatedTests;
    if (!focused && (missing.length || missingComponents.length))
      this.error = new Error(
        'Screens without a rendered accessibility audit:\n' +
          [...missing, ...missingComponents].join('\n'),
      );
    process.stderr.write(
      `Screen accessibility: ${expected.length - missing.length}/${expected.length} implementation files, ${expectedComponents.length - missingComponents.length}/${expectedComponents.length} exports, ${rows.length} renders, ${issues.size} unique findings\n`,
    );
  }
  getLastError() {
    return this.error;
  }
}
module.exports = ScreenA11yReporter;
