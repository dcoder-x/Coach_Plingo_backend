export class SimpleLogger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, data?: unknown): void {
    console.log(`[${new Date().toISOString()}] [${this.context}] INFO: ${message}`, data || '');
  }

  warn(message: string, data?: unknown): void {
    console.warn(`[${new Date().toISOString()}] [${this.context}] WARN: ${message}`, data || '');
  }

  error(message: string, error?: unknown): void {
    console.error(
      `[${new Date().toISOString()}] [${this.context}] ERROR: ${message}`,
      error instanceof Error ? error.stack : error || '',
    );
  }

  debug(message: string, data?: unknown): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${new Date().toISOString()}] [${this.context}] DEBUG: ${message}`, data || '');
    }
  }
}
