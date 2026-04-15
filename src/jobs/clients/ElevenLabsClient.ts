import axios from 'axios';
import { SimpleLogger } from '../../utils/Logger';

export class ElevenLabsClient {
  private readonly apiKey?: string;
  private readonly voiceId: string;
  private readonly logger: SimpleLogger;
  private static disabledReason: string | null = null;
  private static rateLimitedUntil = 0;
  private static readonly maxConcurrent = Math.max(1, Number(process.env.ELEVENLABS_MAX_CONCURRENT || 2));
  private static inFlightRequests = 0;
  private static waitQueue: Array<() => void> = [];
  private static lastRateLimitLogAt = 0;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
    this.logger = new SimpleLogger('ElevenLabsClient');
  }

  async generateSpeech(text: string): Promise<string> {
    if (!this.hasConfiguredKey()) {
      return '';
    }

    if (ElevenLabsClient.disabledReason) {
      return '';
    }

    if (Date.now() < ElevenLabsClient.rateLimitedUntil) {
      return '';
    }

    const releaseSlot = await this.acquireSlot();

    try {
      if (ElevenLabsClient.disabledReason || Date.now() < ElevenLabsClient.rateLimitedUntil) {
        return '';
      }

      const response = await axios.post<ArrayBuffer>(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
        {
          text,
          model_id: 'eleven_flash_v2_5',
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
    } catch (error) {
      const details = this.extractErrorDetails(error);

      if (details.status === 401 || details.status === 403) {
        ElevenLabsClient.disabledReason = details.message || `HTTP_${details.status}`;
        this.logger.error(
          `ElevenLabs disabled for current process due to auth failure (${details.status}). message=${details.message || 'unknown'}`,
        );
        return '';
      }

      if (details.status === 429) {
        ElevenLabsClient.rateLimitedUntil = Date.now() + 60_000;

        const now = Date.now();
        if (now - ElevenLabsClient.lastRateLimitLogAt >= 5000) {
          ElevenLabsClient.lastRateLimitLogAt = now;
          this.logger.warn(
            `ElevenLabs rate-limited; audio generation paused for 60s. status=${details.status} message=${details.message || 'unknown'}`,
          );
        }

        return '';
      }

      this.logger.warn(
        `ElevenLabs request failed; audio skipped. status=${details.status || 'unknown'} code=${details.code || 'unknown'} message=${details.message || 'unknown'}`,
      );
      return '';
    } finally {
      releaseSlot();
    }
  }

  private async acquireSlot(): Promise<() => void> {
    if (ElevenLabsClient.inFlightRequests < ElevenLabsClient.maxConcurrent) {
      ElevenLabsClient.inFlightRequests += 1;
      return this.releaseSlot;
    }

    await new Promise<void>((resolve) => {
      ElevenLabsClient.waitQueue.push(() => {
        ElevenLabsClient.inFlightRequests += 1;
        resolve();
      });
    });

    return this.releaseSlot;
  }

  private readonly releaseSlot = (): void => {
    ElevenLabsClient.inFlightRequests = Math.max(0, ElevenLabsClient.inFlightRequests - 1);
    const next = ElevenLabsClient.waitQueue.shift();
    if (next) {
      next();
    }
  };

  private extractErrorDetails(error: unknown): { status?: number; code?: string; message?: string } {
    if (!axios.isAxiosError(error)) {
      return {
        message: error instanceof Error ? error.message : String(error),
      };
    }

    const status = error.response?.status;
    const code = error.code;
    const responseMessage = this.extractResponseMessage(error.response?.data);

    return {
      status,
      code,
      message: responseMessage || error.message,
    };
  }

  private extractResponseMessage(data: unknown): string | undefined {
    try {
      if (Buffer.isBuffer(data)) {
        const parsed = JSON.parse(data.toString('utf8')) as { detail?: { status?: string; message?: string } };
        return parsed.detail?.message || parsed.detail?.status;
      }

      if (data instanceof ArrayBuffer) {
        const parsed = JSON.parse(Buffer.from(data).toString('utf8')) as {
          detail?: { status?: string; message?: string };
        };
        return parsed.detail?.message || parsed.detail?.status;
      }

      if (typeof data === 'object' && data !== null) {
        const parsed = data as { detail?: { status?: string; message?: string } };
        return parsed.detail?.message || parsed.detail?.status;
      }

      if (typeof data === 'string') {
        return data;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private hasConfiguredKey(): boolean {
    return Boolean(this.apiKey && !this.apiKey.startsWith('YOUR_') && this.apiKey !== 'YOUR_ELEVENLABS_API_KEY');
  }
}
