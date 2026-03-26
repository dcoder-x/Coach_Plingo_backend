import { z } from 'zod';

export const formatZodErrors = (error: z.ZodError): Record<string, string[]> => {
  const formattedErrors: Record<string, string[]> = {};

  error.errors.forEach((err) => {
    const path = err.path.join('.');
    if (!formattedErrors[path]) {
      formattedErrors[path] = [];
    }
    formattedErrors[path].push(err.message);
  });

  return formattedErrors;
};
