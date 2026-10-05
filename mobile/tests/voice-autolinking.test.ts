import { configurePodfile } from '../plugins/withVoiceAutolinking';
const template = "target 'OPAX' do\n  use_expo_modules!\nend\n";
test('production excludes the voice module through the supported Expo Podfile option', () => {
  const production = configurePodfile(template, 'production');
  expect(production).toContain("use_expo_modules! :exclude => ['opax-voice']");
  expect(configurePodfile(production, 'production')).toBe(production);
  for (const variant of ['development', 'e2e'])
    expect(configurePodfile(production, variant)).toBe(template);
});
test('a changed Expo template fails closed', () => {
  expect(() => configurePodfile('no module declaration', 'production')).toThrow(
    'expected one Expo module declaration',
  );
});
