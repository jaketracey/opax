import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// pngjs is supplied by Expo's pinned image tooling; decode the committed PNGs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PNG } = require('pngjs') as {
  PNG: {
    sync: {
      read: (bytes: Buffer) => { width: number; height: number; data: Buffer };
    };
  };
};
const asset = (name: string) =>
  readFileSync(join(__dirname, '../assets/icon', name));

test.each(['android-foreground', 'android-monochrome'])(
  '%s keeps the whole star ring inside the adaptive safe circle',
  (name) => {
    const png = PNG.sync.read(asset(`${name}.png`));
    expect([png.width, png.height]).toEqual([1024, 1024]);
    let maxRadius = 0;
    let painted = 0;
    for (let y = 0; y < png.height; y++)
      for (let x = 0; x < png.width; x++) {
        if (png.data[(y * png.width + x) * 4 + 3] === 0) continue;
        painted++;
        maxRadius = Math.max(
          maxRadius,
          Math.hypot(x + 0.5 - 512, y + 0.5 - 512),
        );
      }
    expect(painted).toBeGreaterThan(60000);
    expect(maxRadius).toBeLessThan((1024 * 66) / 108 / 2);
    const paths = asset(`${name}.svg`)
      .toString()
      .match(/d="[^"]+"/g);
    // Both land paths and all seven stars are copied from the iOS source.
    expect(paths).toEqual(
      asset('icon-dark.svg')
        .toString()
        .match(/d="[^"]+"/g),
    );
  },
);

test('the themed icon preserves the complete foreground alpha mask', () => {
  const gold = PNG.sync.read(asset('android-foreground.png'));
  const white = PNG.sync.read(asset('android-monochrome.png'));
  for (let i = 0; i < white.data.length; i += 4) {
    if (white.data[i + 3] !== gold.data[i + 3])
      throw new Error(`Themed alpha differs at ${i}`);
    if (
      white.data[i + 3] &&
      [0, 1, 2].some((offset) => white.data[i + offset] !== 255)
    )
      throw new Error(`Themed pixel is not white at ${i}`);
  }
});

test('the Play listing icon is opaque 512px 32-bit PNG', () => {
  const bytes = asset('play-icon-512.png');
  expect(bytes[24]).toBe(8); // PNG IHDR bit depth
  expect(bytes[25]).toBe(6); // RGBA
  const png = PNG.sync.read(bytes);
  expect([png.width, png.height]).toEqual([512, 512]);
  for (let i = 3; i < png.data.length; i += 4)
    if (png.data[i] !== 255) throw new Error(`Transparent Play pixel at ${i}`);
});
