import { configureAppDelegate } from '../plugins/withSearchGeometryProbe';

const template = `class AppDelegate {
  func launch() {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

test('fixture instrumentation is idempotent and removed when changing variants', () => {
  const fixture = configureAppDelegate(template, 'e2e');
  expect(fixture).toContain('OpaxSearchGeometryProbe.start()');
  expect(fixture).toContain('scroll.adjustedContentInset');
  expect(configureAppDelegate(fixture, 'e2e')).toBe(fixture);
  for (const variant of ['production', 'development']) {
    expect(configureAppDelegate(template, variant)).toBe(template);
    expect(configureAppDelegate(fixture, variant)).toBe(template);
  }
});

test('fixture prebuild fails if its native measurement startup cannot be inserted', () => {
  expect(() => configureAppDelegate('changed template', 'e2e')).toThrow(
    /launch anchor/,
  );
});

test('the merged fixture exports Ask visibility and placeholder measurements together', () => {
  const fixture = configureAppDelegate(template, 'e2e');
  for (const helper of ['visibleFrame', 'visibleRect'])
    expect(fixture).toContain(`func ${helper}(`);
  for (const field of [
    'navContent',
    'tab',
    'askDock',
    'scrollFrame',
    'askProgress',
    'placeholder',
    'placeholderPointSize',
    'placeholderWidth',
    'placeholderLineHeight',
    'placeholderAvailableWidth',
    'placeholderAvailableHeight',
    'askViewport',
    'askComposer',
  ])
    expect(fixture).toContain(`"${field}":`);
  expect(fixture).not.toContain('askStages');
});
