import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logger/app-logger.service';

if (!('toJSON' in BigInt.prototype)) {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

const DEV_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const PROD_DEFAULT_ORIGINS = ['https://app.stackhr.app'];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const appLogger = app.get(AppLoggerService);
  app.useLogger(appLogger);

  // Enable graceful shutdown hooks for PM2, Docker, and system signals (SIGINT/SIGTERM)
  app.enableShutdownHooks();

  // Security HTTP headers
  app.use(helmet());

  app.useBodyParser('json', { limit: '100kb' });

  app.setGlobalPrefix('v1/api', {
    exclude: ['metrics', 'v1/api/metrics', 'health', 'v1/api/health', ''],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const envOrigins =
    process.env.FRONTEND_URL?.split(',').map((origin) => origin.trim()) ?? [];
  const baseOrigins =
    process.env.NODE_ENV === 'production'
      ? PROD_DEFAULT_ORIGINS
      : [...DEV_ALLOWED_ORIGINS, ...PROD_DEFAULT_ORIGINS];

  const allowedOrigins = Array.from(new Set([...baseOrigins, ...envOrigins]));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;

  await app.listen(port, '0.0.0.0');

  appLogger.log(
    `Application is running on: ${await app.getUrl()}`,
    'Bootstrap',
  );
}
void bootstrap();
