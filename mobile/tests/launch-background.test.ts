import type { ExpoConfig } from 'expo/config';
import type { ExportedConfig } from 'expo/config-plugins';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// These asset-generation helpers are internal to the pinned native plugin.
import { getIosSplashConfig } from '../node_modules/expo-splash-screen/plugin/build/getIosSplashConfig';
import {
  SPLASHSCREEN_COLORSET_PATH,
  withIosSplashColors,
} from '../node_modules/expo-splash-screen/plugin/build/withIosSplashColors';
import type { Props } from 'expo-splash-screen/plugin';
import { dark, light } from '../src/design/tokens.generated';

test.each([
  ['development', 'automatic', true],
  ['e2e', 'automatic', true],
  ['e2e', 'light', false],
  ['production', 'automatic', false],
] as const)(
  '%s %s generates launch colour assets from the page palette',
  async (variant, appearance, hasDark) => {
    const config = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--eval',
          "console.log(JSON.stringify(require('./app.config.ts').default));",
        ],
        {
          cwd: join(__dirname, '..'),
          env: {
            ...process.env,
            OPAX_VARIANT: variant,
            OPAX_APPEARANCE: appearance,
          },
          encoding: 'utf8',
        },
      ),
    ) as ExpoConfig;
    const plugin = config.plugins!.find(
      (entry) => Array.isArray(entry) && entry[0] === 'expo-splash-screen',
    ) as [string, Props];
    const splash = getIosSplashConfig(plugin[1]);
    const directory = mkdtempSync(join(tmpdir(), 'opax-launch-colours-'));
    const source = join(directory, 'ios/OPAX');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'AppDelegate.swift'), '');
    try {
      // Exercise the installed plugin, including its generated dark asset.
      const mod: ExportedConfig = withIosSplashColors(
        { name: 'OPAX', slug: 'opax' },
        splash,
      );
      await mod.mods!.ios!.dangerous!({
        ...mod,
        modRawConfig: mod,
        modResults: {},
        modRequest: {
          projectRoot: directory,
          platformProjectRoot: join(directory, 'ios'),
          modName: 'dangerous',
          platform: 'ios',
          introspect: false,
        },
      });
      const asset = JSON.parse(
        readFileSync(
          join(source, SPLASHSCREEN_COLORSET_PATH, 'Contents.json'),
          'utf8',
        ),
      ) as {
        colors: {
          appearances?: { appearance: string; value: string }[];
          color: { components: { red: string; green: string; blue: string } };
        }[];
      };
      const hex = (index: number) => {
        const c = asset.colors[index]!.color.components;
        return (
          '#' +
          [c.red, c.green, c.blue]
            .map((value) =>
              Math.round(Number(value) * 255)
                .toString(16)
                .padStart(2, '0'),
            )
            .join('')
            .toUpperCase()
        );
      };
      expect(hex(0)).toBe(light.paper);
      expect(asset.colors).toHaveLength(hasDark ? 2 : 1);
      if (hasDark) {
        expect(hex(1)).toBe(dark.paper);
        expect(asset.colors[1]!.appearances).toEqual([
          { appearance: 'luminosity', value: 'dark' },
        ]);
      } else {
        expect(config.userInterfaceStyle).toBe('light');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
