import request from 'supertest';
import { createApp } from '../../src/app';

describe('createApp', () => {
  it('returns health status', async () => {
    const app = createApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBeUndefined();
    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it('returns 404 for unknown routes', async () => {
    const app = createApp();

    const response = await request(app).get('/missing-endpoint');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Endpoint not found',
        statusCode: 404,
      }),
    );
  });
});
