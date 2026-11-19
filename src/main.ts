import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logger/app-logger.service';
import { CsrfOriginGuard } from './common/guards/csrf-origin.guard';
import { getAllowedOrigins } from './common/security/cors-origins';

if (!('toJSON' in BigInt.prototype)) {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  const appLogger = app.get(AppLoggerService);
  app.useLogger(appLogger);

  // Enable graceful shutdown hooks for PM2, Docker, and system signals (SIGINT/SIGTERM)
  app.enableShutdownHooks();

  // Security HTTP headers
  app.use(helmet());

  app.useBodyParser('json', {
    limit: '100kb',
    verify: (req: any, _res: any, buf: Buffer) => {
      req.rawBody = buf;
    },
  });

  app.setGlobalPrefix('v1/api', {
    exclude: [
      'metrics',
      'v1/api/metrics',
      'health',
      'v1/api/health',
      'banking/webhook',
      '',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const allowedOrigins = getAllowedOrigins();

  app.useGlobalGuards(new CsrfOriginGuard(allowedOrigins));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;

  await app.listen(port, '0.0.0.0');

  appLogger.log(
    `Application is running on: ${await app.getUrl()}`,
    'Bootstrap',
  );
}
void bootstrap();
