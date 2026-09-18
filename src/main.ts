import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

const DEV_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const PROD_DEFAULT_ORIGINS = ['https://app.stackhr.app'];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Set tight default JSON limit to prevent body payload flooding DoS
  app.useBodyParser('json', { limit: '100kb' });

  app.setGlobalPrefix('v1/api');

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

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}
void bootstrap();
