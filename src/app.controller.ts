import { Controller, Get, Optional } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './database/prisma.service';
import { OutboxService } from './common/outbox/outbox.service';
import { ResilientHttpClient } from './common/resilience/resilient-client';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly outboxService?: OutboxService,
    @Optional() private readonly resilientClient?: ResilientHttpClient,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get(['health', 'v1/api/health'])
  async getHealth() {
    const mem = process.memoryUsage();
    let dbStatus: 'up' | 'down' = 'up';
    let dbLatencyMs = 0;

    if (this.prisma) {
      const dbStart = Date.now();
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        dbLatencyMs = Date.now() - dbStart;
      } catch {
        dbStatus = 'down';
      }
    }

    let dlqDepth = 0;
    if (this.outboxService) {
      try {
        dlqDepth = await this.outboxService.getDlqCount();
      } catch {
        // Non-blocking
      }
    }

    const circuitStats = this.resilientClient
      ? this.resilientClient.getAllCircuitStats()
      : [];

    const isHealthy = dbStatus === 'up';

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: dbStatus,
        responseTimeMs: dbLatencyMs,
      },
      memory: {
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      },
      circuitBreakers: circuitStats,
      outboxDlq: {
        depth: dlqDepth,
      },
    };
  }
}
