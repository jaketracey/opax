import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configureLaunchBackground } from '../plugins/withSceneLifecycle';
import { light } from '../src/design/tokens.generated';

const mobile = join(__dirname, '..');
const template = execFileSync(
  'tar',
  [
    '-xOf',
    require.resolve('expo/template.tgz'),
    'package/ios/HelloWorld/AppDelegate.swift',
  ],
  { encoding: 'utf8' },
);

test('the scene plugin colours the window before React starts and the root before attachment', () => {
  // Exercise both our plugin and Expo's installed scene-support transform.
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        `
    const { execFileSync } = require('node:child_process');
    const plugin = require('./plugins/withSceneLifecycle');
    const config = plugin({
      name: 'OPAX', slug: 'opax',
      _internal: { projectRoot: process.cwd() },
    });
    const contents = execFileSync('tar', ['-xOf', require.resolve('expo/template.tgz'),
      'package/ios/HelloWorld/AppDelegate.swift'], { encoding: 'utf8' });
    const modRequest = {
      projectRoot: process.cwd(), platformProjectRoot: process.cwd() + '/ios',
      platform: 'ios', introspect: true,
    };
    (async () => {
      const app = await config.mods.ios.appDelegate({
        ...config, modRequest: { ...modRequest, modName: 'appDelegate' },
        modResults: { language: 'swift', contents },
      });
      const info = await config.mods.ios.infoPlist({
        ...config, modRequest: { ...modRequest, modName: 'infoPlist' }, modResults: {},
      });
      console.log(JSON.stringify({ contents: app.modResults.contents, info: info.modResults }));
    })().catch(error => { console.error(error); process.exit(1); });
  `,
      ],
      { cwd: mobile, encoding: 'utf8' },
    ),
  ) as {
    contents: string;
    info: { UIApplicationSceneManifest: unknown };
  };
  expect(output.contents).toContain('ExpoReactNativeFactoryProvider');
  expect(output.contents).not.toContain('window = UIWindow(frame:');
  expect(output.contents).not.toContain('factory.startReactNative(');
  expect(output.contents).toMatch(/var window: UIWindow\? \{\s+didSet \{/);
  expect(output.contents).toContain(
    'window?.backgroundColor = UIColor(named: "SplashScreenBackground")',
  );
  expect(output.contents).toContain(
    'override func customize(_ rootView: UIView)',
  );
  expect(output.contents).toContain('super.customize(rootView)');
  expect(output.contents).toContain(
    'rootView.backgroundColor = UIColor(named: "SplashScreenBackground")',
  );
  const rgb = light.paper
    .slice(1)
    .match(/../g)!
    .map((hex) => parseInt(hex, 16));
  expect(output.contents).toContain(
    `UIColor(red: ${rgb[0]}.0 / 255.0, green: ${rgb[1]}.0 / 255.0, blue: ${rgb[2]}.0 / 255.0, alpha: 1)`,
  );
  expect(output.info.UIApplicationSceneManifest).toMatchObject({
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        { UISceneDelegateClassName: 'EXExpoAppSceneDelegate' },
      ],
    },
  });
  const scene = readFileSync(
    join(
      mobile,
      'node_modules/expo/ios/AppDelegates/ExpoAppSceneDelegate.swift',
    ),
    'utf8',
  );
  expect(scene.indexOf('provider.window = window')).toBeLessThan(
    scene.indexOf('factory.startReactNative('),
  );
  expect(configureLaunchBackground(output.contents)).toBe(output.contents);
});

test('launch background generation is idempotent and rejects an unknown native template', () => {
  const configured = configureLaunchBackground(template);
  expect(configureLaunchBackground(configured)).toBe(configured);
  expect(() => configureLaunchBackground('class AppDelegate {}')).toThrow(
    'missing standard Expo',
  );
  expect(() =>
    configureLaunchBackground(
      template.replace(
        '  var window: UIWindow?',
        '  let customWindow: UIWindow?',
      ),
    ),
  ).toThrow('missing standard Expo');
  expect(() =>
    configureLaunchBackground(
      template.replace(
        'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {',
        'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {\n  override func customize(_ view: UIView) {}',
      ),
    ),
  ).toThrow('missing standard Expo');
});
