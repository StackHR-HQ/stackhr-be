import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://app.stackhr.app',
];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useBodyParser('json', { limit: '4mb' });

  app.setGlobalPrefix('v1/api');

  const allowedOrigins = Array.from(
    new Set([
      ...DEFAULT_ALLOWED_ORIGINS,
      ...(process.env.FRONTEND_URL?.split(',').map((origin) => origin.trim()) ??
        []),
    ]),
  );

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}
void bootstrap();
