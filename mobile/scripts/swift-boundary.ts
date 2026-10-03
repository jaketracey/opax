import { relative, resolve } from 'node:path';
import { reviewedSwiftNetworking } from './native-review-policy';

const networking =
  /\b(?:(?:NS)?URLSession\w*|NW(?:Connection|Listener|Browser|Parameters|Protocol\w*|TCPConnection|UDPSession)\w*|(?:WK|UI)WebView|NSURLConnection|CF\w*Stream\w*|CFSocket\w*|CFHTTP\w*|LPMetadataProvider|SFSafariViewController)\b|\b(?:Darwin|Glibc)\s*\.\s*(?:socket|connect|sendto|recvfrom|getaddrinfo)\b|\bStream\s*\.\s*getStreamsToHost\b|\bsocket\s*\(/g;
// Match the URL-reading initializers, not generic collection contentsOf labels.
// In particular, the voice core's append(contentsOf:) does not perform I/O.
const urlConstructors =
  /\b(?:NSData|Data|String|XMLParser)(?:\s*\.\s*init)?\s*\(\s*contentsOf\s*:|\b(?:AVPlayer(?:Item)?|AV(?:URL)?Asset)(?:\s*\.\s*init)?\s*\(\s*url\s*:|\bUIApplication\s*\.\s*shared\s*\.\s*open\b/g;
const fileURL =
  /^\s*(?:Bundle\s*\.\s*(?:main|module)\s*\.\s*url\s*\(|URL\s*\(\s*fileURLWithPath\s*:)/;

function localFileArgument(content: string, start: number): boolean {
  const argument = content.slice(start);
  if (fileURL.test(argument)) return true;
  const name = /^\s*(\w+)\s*(?:\)|,)/.exec(argument)?.[1];
  if (!name) return false;
  // Typed uses (including function parameters) or closure headers can shadow
  // the binding. Be conservative: require an inline file URL in those cases.
  if (new RegExp(`\\b${name}\\s*:`).test(content)) return false;
  if (
    [...content.matchAll(/\{([^{};=]*?)\bin\b/g)].some((match) =>
      new RegExp(`\\b${name}\\b`).test(match[1]!),
    )
  )
    return false;
  // Recognize a single immutable binding of an explicit file URL. Multiple
  // declarations stay gated; arbitrary URL variables are not trusted.
  const declarations = [
    ...content.matchAll(new RegExp(`\\b(?:let|var)\\s+${name}\\b`, 'g')),
  ];
  if (declarations.length !== 1 || declarations[0]!.index >= start)
    return false;
  const tail = content.slice(declarations[0]!.index);
  const initializer = new RegExp(`^let\\s+${name}\\s*=([\\s\\S]*)`).exec(
    tail,
  )?.[1];
  return !!initializer && fileURL.test(initializer);
}

export function scanSwift(
  path: string,
  content: string,
  cwd = process.cwd(),
): string[] {
  // Standalone comments/documentation do not introduce native APIs. Keep offsets
  // intact so URL argument checks still refer to the same source positions.
  content = content.replace(/^[ \t]*\/\/[^\r\n]*/gm, (comment) =>
    ' '.repeat(comment.length),
  );
  const file = relative(cwd, resolve(cwd, path)).split('\\').join('/');
  const allowed: string[] =
    reviewedSwiftNetworking[file as keyof typeof reviewedSwiftNetworking] ?? [];
  const found = [
    ...content.matchAll(networking),
    ...[...content.matchAll(urlConstructors)].filter(
      (match) =>
        match[0].startsWith('UIApplication') ||
        !localFileArgument(content, match.index + match[0].length),
    ),
  ].map((match) => match[0]);
  return [
    ...new Set(
      found.filter((api) => !allowed.some((prefix) => api.startsWith(prefix))),
    ),
  ].map((api) => `Unreviewed Swift networking API: ${api}`);
}
