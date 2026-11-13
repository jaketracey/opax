import { relative } from 'node:path';

/**
 * LayoutAnimation does nothing on iOS while Reanimated 4.5 owns Fabric's
 * layout-animation delegate (src/design/reveal.tsx), so content meant to ease
 * open just jumps. Content that comes and goes uses HeightReveal instead, and
 * Ask's composer follows the keyboard through Reanimated
 * (src/features/ask/keyboard.tsx). A file listed here would keep
 * LayoutAnimation, with the reason; paths are relative to the source root.
 * None is listed.
 */
export const layoutAnimationAllowed: Readonly<Record<string, string>> = {};

/** True when code (comments aside) names LayoutAnimation. */
export function usesLayoutAnimation(content: string): boolean {
  const code = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return /\bLayoutAnimation\b/.test(code);
}

/**
 * Files under `sourceRoot` that use LayoutAnimation without an entry, and
 * entries whose file no longer uses it (so the list cannot go stale).
 */
export function layoutAnimationIssues(
  files: readonly { path: string; content: string }[],
  sourceRoot: string,
  allowed: Readonly<Record<string, string>> = layoutAnimationAllowed,
): string[] {
  const users = new Set(
    files
      .filter((file) => usesLayoutAnimation(file.content))
      .map((file) => relative(sourceRoot, file.path)),
  );
  const listed = (path: string) => Object.hasOwn(allowed, path);
  return [
    ...[...users]
      .filter((path) => !listed(path))
      .map(
        (path) => `${path}: LayoutAnimation is inert on iOS; use HeightReveal`,
      ),
    ...Object.keys(allowed)
      .filter((path) => !users.has(path))
      .map((path) => `${path}: listed but no longer uses LayoutAnimation`),
  ];
}
