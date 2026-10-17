import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { OutboxService } from '../outbox/outbox.service';
import { ResilientHttpClient } from '../resilience/resilient-client';

describe('MetricsController', () => {
  let controller: MetricsController;
  let metricsService: MetricsService;
  let outboxService: jest.Mocked<Partial<OutboxService>>;
  let resilientClient: jest.Mocked<Partial<ResilientHttpClient>>;

  beforeEach(async () => {
    outboxService = {
      getDlqCount: jest.fn().mockResolvedValue(5),
    };

    resilientClient = {
      getAllCircuitStats: jest.fn().mockReturnValue([
        {
          name: 'PenCentral',
          state: 'CLOSED',
          consecutiveFailures: 0,
          lastFailureTime: 0,
          isAvailable: true,
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        MetricsService,
        { provide: OutboxService, useValue: outboxService },
        { provide: ResilientHttpClient, useValue: resilientClient },
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(metricsService).toBeDefined();
  });

  it('should sync gauges and return formatted Prometheus metrics output', async () => {
    const output = await controller.getMetrics();
    expect(outboxService.getDlqCount).toHaveBeenCalled();
    expect(resilientClient.getAllCircuitStats).toHaveBeenCalled();
    expect(output).toContain('stackhr_outbox_dlq_depth 5');
    expect(output).toContain(
      'stackhr_circuit_breaker_state{breaker_name="PenCentral"} 0',
    );
  });
});
