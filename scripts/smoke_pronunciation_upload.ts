import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';

function createSilentWavBuffer(durationSeconds: number = 1, sampleRate = 8000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = durationSeconds * sampleRate;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  let offset = 0;
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;
  buffer.writeUInt16LE(1, offset); offset += 2;
  buffer.writeUInt16LE(numChannels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, offset); offset += 4;
  buffer.writeUInt16LE(numChannels * bytesPerSample, offset); offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset);

  return buffer;
}

async function main() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  const app = createApp();
  const token = jwt.sign(
    { learnerId: 'smoke-learner', email: 'smoke@example.com' },
    jwtSecret,
    { expiresIn: '5m' },
  );

  const audioBuffer = createSilentWavBuffer(1, 8000);

  const response = await request(app)
    .post('/pronunciation/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('audio', audioBuffer, {
      filename: 'smoke.wav',
      contentType: 'audio/wav',
    });

  console.log(
    JSON.stringify(
      {
        status: response.status,
        body: response.body,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
