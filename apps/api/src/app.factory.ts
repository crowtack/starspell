import 'reflect-metadata';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { getAllowedOrigins } from './common/origin-header.guard.js';
import { requestIdMiddleware } from './common/request-id.middleware.js';

export interface CreateApiAppOptions {
  readonly authRateLimitMax?: number;
  readonly authRateLimitWindowMs?: number;
}

/**
 * Builds and configures the NestJS application with Helmet, CORS,
 * cookie-parser, and auth rate limiting. Shared by main.ts and integration tests.
 */
export async function createApiApp(options: CreateApiAppOptions = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.useLogger(['error', 'warn']);

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cookieParser());

  const allowedOrigins = Array.from(getAllowedOrigins());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
  });

  const limiter = rateLimit({
    windowMs: options.authRateLimitWindowMs ?? 15 * 60 * 1000,
    limit: options.authRateLimitMax ?? 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
      },
    },
  });
  app.use('/api/auth/register', limiter);
  app.use('/api/auth/login', limiter);

  return app;
}
