import { AppError } from '../../src/utils/AppError';

describe('AppError', () => {
  it('creates a conflict error with details', () => {
    const error = AppError.conflict('Duplicate resource', { field: 'email' });

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Duplicate resource');
    expect(error.details).toEqual({ field: 'email' });
  });

  it('creates a default unauthorized error', () => {
    const error = AppError.unauthorized();

    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Unauthorized');
  });
});
