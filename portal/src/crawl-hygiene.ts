/** Reject placeholder IDs before route parsing, redirects or upstream lookup. */
export function missingEntitySlug(path: string): boolean {
  let parts: string[];
  try { parts = path.split('/').filter(Boolean).map(s => decodeURIComponent(s).trim()); } catch { return false; }
  const start = parts[0] === 'subject' ? 2
    : ['doc','bill','reports','division'].includes(parts[0]) ? 1
    : parts[0] === 'money' && parts[1] === 'grants' && ['recipient','program'].includes(parts[3]) ? 4 : parts.length;
  return parts.slice(start).some(s => /^(null|undefined)$/i.test(s));
}
