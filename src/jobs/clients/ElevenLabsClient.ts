import axios from 'axios';
import { SimpleLogger } from '../../utils/Logger';

export class ElevenLabsClient {
  private readonly apiKey?: string;
  private readonly voiceId: string;
  private readonly logger: SimpleLogger;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
    this.logger = new SimpleLogger('ElevenLabsClient');
  }

  async generateSpeech(text: string): Promise<string> {
    if (!this.hasConfiguredKey()) {
      return this.buildMockAudioUrl(text);
    }

    try {
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
    } catch (error) {
      this.logger.warn('ElevenLabs request failed, using mock audio', error);
      return this.buildMockAudioUrl(text);
    }
  }

  private buildMockAudioUrl(text: string): string {
    const base64 = Buffer.from(`mock-audio:${text}`).toString('base64');
    return `data:audio/plain;base64,${base64}`;
  }

  private hasConfiguredKey(): boolean {
    return Boolean(this.apiKey && !this.apiKey.startsWith('YOUR_') && this.apiKey !== 'YOUR_ELEVENLABS_API_KEY');
  }
}
