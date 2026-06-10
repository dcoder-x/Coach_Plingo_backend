import { PrismaClient } from '@prisma/client';
import { ContentService } from '../../src/services/ContentService';

describe('ContentService v3 transition', () => {
  const originalContentMode = process.env.CONTENT_MODE;

  afterEach(() => {
    if (typeof originalContentMode === 'undefined') {
      delete process.env.CONTENT_MODE;
    } else {
      process.env.CONTENT_MODE = originalContentMode;
    }
  });

  function createService() {
    return new ContentService({} as PrismaClient);
  }

  it('defaults to dynamic mode when CONTENT_MODE is unset', () => {
    delete process.env.CONTENT_MODE;

    const service = createService();

    expect(service.getContentMode()).toBe('dynamic');
  });

  it('accepts preseed mode', () => {
    process.env.CONTENT_MODE = 'preseed';

    const service = createService();

    expect(service.getContentMode()).toBe('preseed');
  });

  it('rejects invalid content mode values', () => {
    process.env.CONTENT_MODE = 'invalid';

    const service = createService();

    expect(() => service.getContentMode()).toThrow('Invalid CONTENT_MODE value');
  });
});
