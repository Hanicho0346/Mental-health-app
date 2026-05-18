const isDev = process.env.NODE_ENV !== 'production';

export function formatUnknownError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  if (typeof err === 'string') {
    return { message: err };
  }
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: '[unserializable error]' };
  }
}

export function logServerError(
  context: string,
  err: unknown,
  extra?: Record<string, unknown>
): void {
  const { message, stack } = formatUnknownError(err);
  console.error(`[${new Date().toISOString()}] [ERROR] ${context}`, {
    ...extra,
    errorMessage: message,
    ...(stack ? { stack } : {}),
  });
}

export function logServerWarn(context: string, info: Record<string, unknown>): void {
  console.warn(`[${new Date().toISOString()}] [WARN] ${context}`, info);
}

export function logServerInfo(context: string, info: Record<string, unknown>): void {
  console.log(`[${new Date().toISOString()}] [INFO] ${context}`, info);
}

export function exposeErrorDetailsToClient(): boolean {
  return isDev;
}
