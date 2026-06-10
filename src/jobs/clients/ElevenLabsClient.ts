import axios from 'axios';
import FormData from 'form-data';
import { PrismaClient } from '@prisma/client';
import { SimpleLogger } from '../../utils/Logger';

interface ElevenLabsSttWord {
  text: string;
  type?: string;
  logprob?: number;
}

export interface ElevenLabsTranscriptionResult {
  text: string;
  languageCode: string | null;
  words: ElevenLabsSttWord[];
}

export interface ElevenLabsSpeechOptions {
  singleWordMode?: boolean;
  // Override the instance-level voice ID for this call (e.g. language-specific voice from DB).
  voiceId?: string;
  // IPA transcription for the text. When provided, wraps the text in a <phoneme> SSML tag so
  // ElevenLabs pronounces loanwords with target-language phonetics rather than English defaults.
  ipa?: string;
}

type ElevenLabsVoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
};

export class ElevenLabsClient {
  private readonly apiKey?: string;
  private readonly voiceId: string;
  private readonly modelId: string;
  private readonly logger: SimpleLogger;
  private static disabledReason: string | null = null;
  private static rateLimitedUntil = 0;
  private static readonly maxConcurrent = Math.max(1, Number(process.env.ELEVENLABS_MAX_CONCURRENT || 2));
  private static inFlightRequests = 0;
  private static waitQueue: Array<() => void> = [];
  private static lastRateLimitLogAt = 0;

  // Looks up the language-specific ElevenLabs voice ID seeded in LanguageOption.
  // Returns undefined when the row has no ttsVoiceId, letting call sites fall back to
  // the instance default (ELEVENLABS_VOICE_ID env var).
  static async resolveVoiceId(prisma: PrismaClient, languageCode: string): Promise<string | undefined> {
    const lang = await prisma.languageOption.findUnique({
      where: { code: languageCode },
      select: { ttsVoiceId: true },
    });
    return lang?.ttsVoiceId ?? undefined;
  }

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
    this.modelId = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
    this.logger = new SimpleLogger('ElevenLabsClient');
  }

  async generateSpeech(text: string, languageCode?: string, options?: ElevenLabsSpeechOptions): Promise<string> {
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

      const effectiveVoiceId = options?.voiceId ?? this.voiceId;
      const speechText = this.buildSpeechText(text, options?.ipa);

      const body: Record<string, unknown> = {
        text: speechText,
        model_id: this.modelId,
      };
      if (languageCode) {
        body.language_code = languageCode;
      }

      if (options?.singleWordMode) {
        const voiceSettings = this.getSingleWordVoiceSettings();
        if (voiceSettings) {
          body.voice_settings = voiceSettings;
        }
      }

      const response = await axios.post<ArrayBuffer>(
        `https://api.elevenlabs.io/v1/text-to-speech/${effectiveVoiceId}`,
        body,
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

  async transcribeFromUrl(
    audioUrl: string,
    languageCode?: string,
  ): Promise<ElevenLabsTranscriptionResult | null> {
    if (!this.hasConfiguredKey()) {
      return null;
    }

    if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
      this.logger.warn('ElevenLabs STT skipped due to invalid audio URL');
      return null;
    }

    try {
      const form = new FormData();
      form.append('model_id', 'scribe_v2');
      form.append('source_url', audioUrl);
      if (languageCode) {
        form.append('language_code', languageCode);
      }

      const response = await axios.post(
        'https://api.elevenlabs.io/v1/speech-to-text',
        form,
        {
          headers: {
            'xi-api-key': this.apiKey,
            ...form.getHeaders(),
          },
          timeout: 30_000,
        },
      );

      const data = response.data as {
        text?: string;
        language_code?: string;
        words?: Array<{ text?: string; type?: string; logprob?: number }>;
      };

      return {
        text: String(data.text || '').trim(),
        languageCode: data.language_code || null,
        words: Array.isArray(data.words)
          ? data.words
            .filter((word) => typeof word?.text === 'string')
            .map((word) => ({
              text: String(word.text),
              type: word.type,
              logprob: typeof word.logprob === 'number' ? word.logprob : undefined,
            }))
          : [],
      };
    } catch (error) {
      const details = this.extractErrorDetails(error);
      this.logger.warn(
        `ElevenLabs STT request failed. status=${details.status || 'unknown'} message=${details.message || 'unknown'}`,
      );
      return null;
    }
  }

  // When IPA is available, wrap the text in a <phoneme> SSML tag so ElevenLabs uses the
  // exact target-language phonetics instead of guessing from the ASCII spelling.
  private buildSpeechText(text: string, ipa?: string): string {
    const input = String(text || '').trim();
    if (!input || !ipa?.trim()) {
      return input;
    }
    return `<phoneme alphabet="ipa" ph="${ipa.trim()}">${input}</phoneme>`;
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

  private getSingleWordVoiceSettings(): ElevenLabsVoiceSettings | null {
    const stability = this.parseOptionalNumber(process.env.ELEVENLABS_WORD_STABILITY, 0, 1);
    const similarityBoost = this.parseOptionalNumber(process.env.ELEVENLABS_WORD_SIMILARITY_BOOST, 0, 1);
    const style = this.parseOptionalNumber(process.env.ELEVENLABS_WORD_STYLE, 0, 1);
    const useSpeakerBoost = this.parseOptionalBoolean(process.env.ELEVENLABS_WORD_USE_SPEAKER_BOOST);

    const settings: ElevenLabsVoiceSettings = {
      ...(stability !== undefined ? { stability } : {}),
      ...(similarityBoost !== undefined ? { similarity_boost: similarityBoost } : {}),
      ...(style !== undefined ? { style } : {}),
      ...(useSpeakerBoost !== undefined ? { use_speaker_boost: useSpeakerBoost } : {}),
    };

    return Object.keys(settings).length > 0 ? settings : null;
  }

  private parseOptionalNumber(raw: string | undefined, min: number, max: number): number | undefined {
    if (raw === undefined || raw.trim() === '') {
      return undefined;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }

    return Math.min(max, Math.max(min, parsed));
  }

  private parseOptionalBoolean(raw: string | undefined): boolean | undefined {
    if (raw === undefined || raw.trim() === '') {
      return undefined;
    }

    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
      return false;
    }

    return undefined;
  }
}
