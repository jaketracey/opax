// Objective-C/C sources have no reviewed networking exceptions. The existing
// voice grants apply to exact Swift files only, not to neighboring native code.
const networking =
  /\b(?:NSURLSession\w*|NSURLConnection|CF\w*Stream\w*|CFSocket\w*|CFHTTP\w*|(?:WK|UI)WebView|SFSafariViewController|LPMetadataProvider|nw_(?:connection|endpoint)\w*)\b|\b(?:dataWithContentsOfURL|initWithContentsOfURL|openURL)\s*:|\b(?:socket|socketpair|connect|bind|listen|accept|accept4|send|sendto|sendmsg|recv|recvfrom|recvmsg|getaddrinfo|gethostbyname|getnameinfo|setsockopt)\s*\(/g;

export function scanNative(content: string): string[] {
  return [
    ...new Set([...content.matchAll(networking)].map((match) => match[0])),
  ].map((api) => `Unreviewed Objective-C/C networking API: ${api}`);
}
