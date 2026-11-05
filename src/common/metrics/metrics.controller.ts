import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Optional,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { MetricsService } from './metrics.service';
import { BypassTransform } from '../interceptors/bypass-transform.decorator';
import { OutboxService } from '../outbox/outbox.service';
import { ResilientHttpClient } from '../resilience/resilient-client';
import { AuthService } from '../../auth/auth.service';

@Controller()
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    @Optional() private readonly outboxService?: OutboxService,
    @Optional() private readonly resilientClient?: ResilientHttpClient,
    @Optional() private readonly authService?: AuthService,
  ) {}

  @Get(['metrics', 'v1/api/metrics'])
  @BypassTransform()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(@Req() req?: Request): Promise<string> {
    await this.assertMetricsAuthorized(req);

    // Dynamically sync gauge metrics before scraping
    if (this.outboxService) {
      try {
        const dlqCount = await this.outboxService.getDlqCount();
        this.metricsService.setDlqDepth(dlqCount);
      } catch {
        // Non-blocking in case DB is temporarily sleeping
      }
    }

    if (this.resilientClient) {
      const circuitStats = this.resilientClient.getAllCircuitStats();
      for (const stat of circuitStats) {
        this.metricsService.setCircuitBreakerState(stat.name, stat.state);
      }
    }

    return this.metricsService.getMetrics();
  }

  private async assertMetricsAuthorized(req?: Request): Promise<void> {
    if (!req) return;

    const scrapeToken = process.env.METRICS_SCRAPE_TOKEN?.trim();
    const headerToken =
      req.header?.('x-metrics-token')?.trim() ||
      (req.header?.('authorization')?.startsWith('Bearer ')
        ? req.header('authorization')!.slice('Bearer '.length).trim()
        : undefined);

    if (scrapeToken && headerToken === scrapeToken) {
      return;
    }

    if (this.authService) {
      const sessionToken = this.authService.getTokenFromRequest(req);
      if (sessionToken) {
        const user = await this.authService.validateSession(sessionToken);
        if (user) {
          if (user.userType === 'STACKHR_ADMIN') {
            return;
          }
          throw new ForbiddenException(
            'Prometheus metrics are restricted to platform administrators or internal scrapers',
          );
        }
      }
    }

    const ip = req.ip || req.socket?.remoteAddress || '';
    const isInternalIp =
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '::ffff:127.0.0.1' ||
      ip.startsWith('10.') ||
      ip.startsWith('172.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('::ffff:10.') ||
      ip.startsWith('::ffff:172.') ||
      ip.startsWith('::ffff:192.168.');

    if (isInternalIp || process.env.NODE_ENV === 'test') {
      return;
    }

    throw new ForbiddenException(
      'Prometheus metrics are restricted to platform administrators or internal scrapers',
    );
  }
}
