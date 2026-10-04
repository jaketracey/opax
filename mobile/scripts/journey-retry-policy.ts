export interface RegisterRetry {
  flow: string;
  registerPrefix: string;
}

/** Command descriptions include skipped scripts too; only JsConsole output
 * proves the conditional retry was entered. */
export function registerRetries(log: string, flow: string): RegisterRetry[] {
  const retries: RegisterRetry[] = [];
  for (const line of log.split('\n')) {
    const marker = line.match(
      /\bJsConsole\b.*\bOPAX_REGISTER_RETRY (\{.*\})\s*$/,
    );
    if (!marker) continue;
    const value = JSON.parse(marker[1]!) as { registerPrefix?: unknown };
    if (
      typeof value.registerPrefix !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(value.registerPrefix)
    )
      throw new Error('Invalid register retry marker');
    retries.push({ flow, registerPrefix: value.registerPrefix });
  }
  return retries;
}
