/** Ask's calculated source rows open a question draft, never generic Ask or Search. */
export function isAskRecordPath(path: string): boolean {
  if (!/^\/ask\?/.test(path)) return false;
  const params = new URLSearchParams(path.slice(5).split('#')[0]);
  return !params.has('view') && !!params.get('q')?.trim();
}
