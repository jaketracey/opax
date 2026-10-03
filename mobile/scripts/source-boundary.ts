import { scanBoundary } from './transport-policy';
export const sourceExtensions = /\.(?:[cm]?[jt]s|[jt]sx)$/;
export const secretPattern =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|sk-(?:proj-)?[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})|(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\/-]{24,}["']/i;
export function scanSource(path: string, content: string): string[] {
  return [...new Set(scanBoundary(path, content).map((issue) => issue.reason))];
}
