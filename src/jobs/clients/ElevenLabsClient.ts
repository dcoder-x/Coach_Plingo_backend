import axios, { AxiosError } from 'axios';
import { SimpleLogger } from '../../utils/Logger';

export class ElevenLabsClient {
  private static activeRequests = 0;
  private static waitQueue: Array<() => void> = [];

  private readonly apiKey?: string;
  private readonly voiceId: string;
  private readonly logger: SimpleLogger;
  private readonly maxRetries: number;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
    this.logger = new SimpleLogger('ElevenLabsClient');
    this.maxRetries = this.parsePositiveInteger(process.env.ELEVENLABS_MAX_RETRIES, 3);
  }

  async generateSpeech(text: string): Promise<string> {
    if (!this.hasConfiguredKey()) {
      return this.buildMockAudioUrl(text);
    }

    return this.withConcurrencyLimit(async () => {
      for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
        try {
          return await this.requestSpeech(text);
        } catch (error: unknown) {
          const retryable = this.isRetryableError(error);
          const details = this.describeError(error);
          this.logger.warn(
            'ElevenLabs request failed',
            `${details} (attempt ${attempt}/${this.maxRetries + 1})`,
          );

          if (!retryable || attempt > this.maxRetries) {
            throw error;
          }

          await this.sleep(this.getRetryDelayMs(error, attempt));
        }
      }

      throw new Error('Failed to generate speech after retry attempts');
    });
  }

  private buildMockAudioUrl(text: string): string {
    const base64 = Buffer.from(`mock-audio:${text}`).toString('base64');
    return `data:audio/mpeg;base64,${base64}`;
  }

  private async requestSpeech(text: string): Promise<string> {
    const response = await axios.post<ArrayBuffer>(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
      {
        text,
        model_id: 'eleven_multilingual_v2',
      },
      {
        headers: {
          'xi-api-key': this.apiKey,
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      },
    );

    const buffer = Buffer.from(response.data);
    return `data:audio/mpeg;base64,${buffer.toString('base64')}`;
  }

  private async withConcurrencyLimit<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquireSlot();

    try {
      return await operation();
    } finally {
      this.releaseSlot();
    }
  }

  private async acquireSlot(): Promise<void> {
    if (ElevenLabsClient.activeRequests < this.getMaxConcurrentRequests()) {
      ElevenLabsClient.activeRequests += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      ElevenLabsClient.waitQueue.push(resolve);
    });

    ElevenLabsClient.activeRequests += 1;
  }

  private releaseSlot(): void {
    ElevenLabsClient.activeRequests = Math.max(0, ElevenLabsClient.activeRequests - 1);

    const next = ElevenLabsClient.waitQueue.shift();
    if (next) {
      next();
    }
  }

  private getMaxConcurrentRequests(): number {
    return this.parsePositiveInteger(process.env.ELEVENLABS_MAX_CONCURRENCY, 2);
  }

  private isRetryableError(error: unknown): boolean {
    const axiosError = error as AxiosError;
    const statusCode = axiosError.response?.status;
    const apiErrorCode = this.extractApiErrorCode(axiosError);

    return (
      statusCode === 429 ||
      statusCode === 500 ||
      statusCode === 502 ||
      statusCode === 503 ||
      statusCode === 504 ||
      apiErrorCode === 'system_busy' ||
      apiErrorCode === 'too_many_concurrent_requests'
    );
  }

  private getRetryDelayMs(error: unknown, attempt: number): number {
    const axiosError = error as AxiosError;
    const retryAfterHeader = axiosError.response?.headers?.['retry-after'];
    const retryAfterSeconds = this.parseRetryAfterSeconds(retryAfterHeader);

    if (retryAfterSeconds !== null) {
      return retryAfterSeconds * 1000;
    }

    const apiErrorCode = this.extractApiErrorCode(axiosError);
    const baseDelay = apiErrorCode === 'too_many_concurrent_requests' ? 1000 : 500;

    return Math.min(baseDelay * 2 ** (attempt - 1), 8000);
  }

  private describeError(error: unknown): string {
    const axiosError = error as AxiosError;
    const statusCode = axiosError.response?.status;
    const apiErrorCode = this.extractApiErrorCode(axiosError);
    const message = axiosError.message;

    if (statusCode && apiErrorCode) {
      return `Request failed with status code ${statusCode} (${apiErrorCode})`;
    }

    if (statusCode) {
      return `Request failed with status code ${statusCode}`;
    }

    return message || 'Unknown ElevenLabs request failure';
  }

  private extractApiErrorCode(error: AxiosError): string | undefined {
    const payload = this.parseErrorPayload(error.response?.data);

    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const candidate = payload as {
      detail?: string | { status?: string; code?: string; message?: string };
      status?: string;
      code?: string;
      message?: string;
      error?: string;
    };

    if (typeof candidate.detail === 'string') {
      return candidate.detail;
    }

    return candidate.detail?.status || candidate.detail?.code || candidate.code || candidate.status || candidate.error;
  }

  private parseErrorPayload(data: unknown): unknown {
    if (!data) {
      return undefined;
    }

    if (typeof data === 'object' && !Buffer.isBuffer(data) && !(data instanceof ArrayBuffer)) {
      return data;
    }

    try {
      if (typeof data === 'string') {
        return JSON.parse(data);
      }

      if (data instanceof ArrayBuffer) {
        return JSON.parse(Buffer.from(data).toString('utf8'));
      }

      if (Buffer.isBuffer(data)) {
        return JSON.parse(data.toString('utf8'));
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private parseRetryAfterSeconds(header: string | string[] | number | undefined): number | null {
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return value;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return asNumber;
    }

    return null;
  }

  private parsePositiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private hasConfiguredKey(): boolean {
    return Boolean(this.apiKey && !this.apiKey.startsWith('YOUR_') && this.apiKey !== 'YOUR_ELEVENLABS_API_KEY');
  }
}
