/**
 * Minimal structured logging for the workflow output.
 *
 * The API key is the only true secret this process handles; `redact()` is a
 * cheap guarantee that it cannot reach the log even by accident, since the
 * workflow output is visible to anyone with repository read access.
 */
let secrets: string[] = [];

export function registerSecret(value: string): void {
  if (value && value.length >= 8) secrets.push(value);
}

export function redact(message: string): string {
  return secrets.reduce((acc, secret) => acc.split(secret).join('[redacted]'), message);
}

function emit(level: string, message: string, context?: Record<string, unknown>): void {
  const line = context
    ? `${message} ${JSON.stringify(context)}`
    : message;
  const stamp = new Date().toISOString();
  const out = `[${stamp}] ${level} ${redact(line)}`;
  if (level === 'ERROR') console.error(out);
  else console.log(out);
}

export const log = {
  info: (message: string, context?: Record<string, unknown>) => emit('INFO ', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('WARN ', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('ERROR', message, context),
  /** GitHub Actions step summary grouping. */
  group: (title: string) => console.log(`::group::${title}`),
  groupEnd: () => console.log('::endgroup::'),
};

export function resetSecrets(): void {
  secrets = [];
}
