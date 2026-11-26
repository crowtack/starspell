import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Parses an untrusted request payload against a Zod schema and throws
 * a structured 400 VALIDATION_ERROR on failure.
 */
export function parseOrThrow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: result.error.issues[0]?.message ?? 'Invalid request payload',
      details: result.error.flatten(),
    });
  }
  return result.data;
}
