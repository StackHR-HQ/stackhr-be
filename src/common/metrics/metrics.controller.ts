import { Controller, Get, Header, Optional } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { BypassTransform } from '../interceptors/bypass-transform.decorator';
import { OutboxService } from '../outbox/outbox.service';
import { ResilientHttpClient } from '../resilience/resilient-client';

@Controller()
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    @Optional() private readonly outboxService?: OutboxService,
    @Optional() private readonly resilientClient?: ResilientHttpClient,
  ) {}

  @Get(['metrics', 'v1/api/metrics'])
  @BypassTransform()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
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
}
