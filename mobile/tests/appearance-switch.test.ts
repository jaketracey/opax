/* eslint-disable @typescript-eslint/no-require-imports -- Plugins are CommonJS. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dark, light } from '../src/design/tokens.generated';

// Dark mode (19 Nov 2026): OPAX_APPEARANCE is the one switch for iOS and
// Android in every variant. flags.test.ts and launch-background.test.ts hold
// the iOS side; this file holds the default and the Android side.
const MOBILE = join(__dirname, '..');
const { DEFAULT_APPEARANCE, APPEARANCES, appearance } =
  require('../plugins/appearance') as {
    DEFAULT_APPEARANCE: string;
    APPEARANCES: string[];
    appearance: (env?: Record<string, string | undefined>) => string;
  };
const policy = require('../plugins/withAndroidPolicy.js') as {
  configureNightMode: (contents: string, appearance: string) => string;
  configureBarButtons: (contents: string, appearance: string) => string;
};
const theme = require('../plugins/withAndroidTheme.js') as {
  themeColors: (appearance?: string) => {
    day: Record<string, string | null>;
    night: Record<string, string | null>;
  };
  withTheme: (
    xml: unknown,
    appearance?: string,
  ) => {
    resources: {
      style: {
        $: { name: string };
        item: { $: { name: string }; _: string }[];
      }[];
    };
  };
};

test('the release default is light until dark boards are approved', () => {
  // Changing this line is the release decision: plugins/appearance.js
  // DEFAULT_APPEARANCE. Change this expectation with it, on purpose.
  expect(DEFAULT_APPEARANCE).toBe('light');
});

test('the switch takes two values and the default when unset', () => {
  expect(APPEARANCES).toEqual(['light', 'automatic']);
  expect(appearance({})).toBe(DEFAULT_APPEARANCE);
  expect(appearance({ OPAX_APPEARANCE: 'automatic' })).toBe('automatic');
  expect(appearance({ OPAX_APPEARANCE: 'light' })).toBe('light');
  for (const bad of ['dark', 'Automatic', ''])
    expect(() => appearance({ OPAX_APPEARANCE: bad })).toThrow(
      'OPAX_APPEARANCE must be light or automatic',
    );
});

test('app.config.ts hands the switch to both Android plugins and reads it nowhere else', () => {
  const config = readFileSync(join(MOBILE, 'app.config.ts'), 'utf8');
  expect(config).toContain(
    "import { appearance as appearanceSwitch } from './plugins/appearance';",
  );
  expect(config).toContain(
    "['./plugins/withAndroidPolicy.js', { appearance }]",
  );
  expect(config).toContain("['./plugins/withAndroidTheme.js', { appearance }]");
  // The environment variable is read in one place only.
  expect(config).not.toContain('OPAX_APPEARANCE');
  // No variant is exempt from the switch.
  expect(config).toContain(
    "userInterfaceStyle: followsSystem ? 'automatic' : 'light'",
  );
  expect(config).toContain(
    "dark: followsSystem ? { backgroundColor: '#142A43' } : undefined",
  );
});

const activity = `class MainActivity : ReactActivity() {
  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
  }
}
`;
const NIGHT = 'androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode';

describe('Android night mode', () => {
  test('light pins AppCompat to day, before the activity is created', () => {
    const out = policy.configureNightMode(activity, 'light');
    expect(out).toContain(
      `    // OPAX Android is light-only\n    ${NIGHT}(androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_NO)\n    super.onCreate(null)`,
    );
    expect(out).not.toContain('MODE_NIGHT_FOLLOW_SYSTEM');
  });

  test('automatic follows the system', () => {
    const out = policy.configureNightMode(activity, 'automatic');
    expect(out).toContain(
      `    // OPAX Android follows the system appearance\n    ${NIGHT}(androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)\n    super.onCreate(null)`,
    );
    expect(out).not.toContain('MODE_NIGHT_NO');
    expect(out).not.toContain('light-only');
  });

  test('a project generated under one setting is rewritten for the other, never doubled', () => {
    const lightFirst = policy.configureNightMode(activity, 'light');
    const switched = policy.configureNightMode(lightFirst, 'automatic');
    expect(switched).toBe(policy.configureNightMode(activity, 'automatic'));
    expect(policy.configureNightMode(switched, 'light')).toBe(lightFirst);
    expect(policy.configureNightMode(lightFirst, 'light')).toBe(lightFirst);
    expect(switched.match(/setDefaultNightMode/g)).toHaveLength(1);
  });

  test('an unknown setting or a changed template fails the prebuild', () => {
    expect(() => policy.configureNightMode(activity, 'dark')).toThrow(
      'expected light or automatic',
    );
    expect(() =>
      policy.configureNightMode('class MainActivity {}', 'light'),
    ).toThrow('onCreate anchor');
  });

  test('navigation bar buttons turn with the scheme only when the system is followed', () => {
    expect(policy.configureBarButtons(activity, 'light')).toBe(activity);
    const out = policy.configureBarButtons(activity, 'automatic');
    expect(out).toContain('// OPAX system bar buttons follow the scheme');
    expect(out).toContain('UI_MODE_NIGHT_YES');
    expect(out).toContain('.isAppearanceLightNavigationBars = !opaxNight');
    // After the superclass has applied the new configuration.
    expect(out.indexOf('super.onConfigurationChanged(newConfig)')).toBeLessThan(
      out.indexOf('opaxNight'),
    );
    expect(policy.configureBarButtons(out, 'automatic')).toBe(out);
    expect(policy.configureBarButtons(out, 'light')).toBe(activity);
    expect(() =>
      policy.configureBarButtons('class MainActivity {}', 'automatic'),
    ).toThrow('configuration hook');
  });
});

describe('Android theme resources', () => {
  const xml = () => ({
    resources: {
      style: [
        {
          $: {
            name: 'AppTheme',
            parent: 'Theme.AppCompat.DayNight.NoActionBar',
          },
          item: [],
        },
      ],
    },
  });
  const appTheme = (out: ReturnType<typeof theme.withTheme>) =>
    Object.fromEntries(
      out.resources.style
        .find((s) => s.$.name === 'AppTheme')!
        .item.map((i) => [i.$.name, i._]),
    );

  test('light writes the navy accent only, as every release to 1.1.5 did', () => {
    expect(theme.themeColors('light')).toEqual({
      day: { opaxNavy: light.navy, opaxWindow: null },
      night: { opaxNavy: null, opaxWindow: null },
    });
    expect(theme.themeColors()).toEqual(theme.themeColors('light'));
    expect(appTheme(theme.withTheme(xml(), 'light'))).not.toHaveProperty(
      'android:windowBackground',
    );
  });

  test('automatic adds night values: pale navy accent and the dark page behind React Native', () => {
    expect(theme.themeColors('automatic')).toEqual({
      day: { opaxNavy: light.navy, opaxWindow: light.paper },
      night: { opaxNavy: dark.navy, opaxWindow: dark.paper },
    });
    expect(appTheme(theme.withTheme(xml(), 'automatic'))).toMatchObject({
      'android:windowBackground': '@color/opaxWindow',
      colorAccent: '@color/opaxNavy',
    });
  });

  test('switching back to light removes the window background again', () => {
    const followed = theme.withTheme(xml(), 'automatic');
    expect(appTheme(theme.withTheme(followed, 'light'))).not.toHaveProperty(
      'android:windowBackground',
    );
  });
});
