// Pure image-path policy, shared by the native Image adapter and offline fixture.
// Binary images never pass through the JSON client's catalog allow-list.
export function assertPortraitPath(path: string): void {
  if (!/^\/photos\/(?:\d+|wd-Q\d+)\.webp$/.test(path))
    throw new Error('Image is outside the portrait allow-list');
}
