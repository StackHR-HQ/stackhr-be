import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should record HTTP requests and durations', async () => {
    service.recordHttpRequest('GET', '/v1/api/employees', 200, 0.045);
    service.recordHttpRequest('POST', '/v1/api/payroll/runs', 201, 0.125);

    const metricsOutput = await service.getMetrics();
    expect(metricsOutput).toContain(
      'stackhr_http_requests_total{method="GET",route="/v1/api/employees",status_code="200"} 1',
    );
    expect(metricsOutput).toContain(
      'stackhr_http_requests_total{method="POST",route="/v1/api/payroll/runs",status_code="201"} 1',
    );
    expect(metricsOutput).toContain(
      'stackhr_http_request_duration_seconds_bucket',
    );
    expect(metricsOutput).toContain(
      'stackhr_http_request_duration_seconds_count',
    );
  });

  it('should track idempotency engine operations', async () => {
    service.recordIdempotency('lease_acquired', 'POST /payroll');
    service.recordIdempotency('replayed', 'POST /payroll');
    service.recordIdempotency('conflict_409', 'POST /payroll');

    const metricsOutput = await service.getMetrics();
    expect(metricsOutput).toContain(
      'stackhr_idempotency_operations_total{action="lease_acquired",operation="POST /payroll"} 1',
    );
    expect(metricsOutput).toContain(
      'stackhr_idempotency_operations_total{action="replayed",operation="POST /payroll"} 1',
    );
    expect(metricsOutput).toContain(
      'stackhr_idempotency_operations_total{action="conflict_409",operation="POST /payroll"} 1',
    );
  });

  it('should record outbox domain events and DLQ depth', async () => {
    service.recordOutboxEvent('approval.decided', 'published');
    service.recordOutboxEvent('payroll.executed', 'dlq_routed');
    service.setDlqDepth(3);

    const metricsOutput = await service.getMetrics();
    expect(metricsOutput).toContain(
      'stackhr_outbox_events_total{event_type="approval.decided",status="published"} 1',
    );
    expect(metricsOutput).toContain(
      'stackhr_outbox_events_total{event_type="payroll.executed",status="dlq_routed"} 1',
    );
    expect(metricsOutput).toContain('stackhr_outbox_dlq_depth 3');
  });

  it('should track circuit breaker states numerically', async () => {
    service.setCircuitBreakerState('PenCentral', 'CLOSED');
    let output = await service.getMetrics();
    expect(output).toContain(
      'stackhr_circuit_breaker_state{breaker_name="PenCentral"} 0',
    );

    service.setCircuitBreakerState('PenCentral', 'OPEN');
    output = await service.getMetrics();
    expect(output).toContain(
      'stackhr_circuit_breaker_state{breaker_name="PenCentral"} 2',
    );

    service.setCircuitBreakerState('PenCentral', 'HALF_OPEN');
    output = await service.getMetrics();
    expect(output).toContain(
      'stackhr_circuit_breaker_state{breaker_name="PenCentral"} 1',
    );
  });

  it('should collect default Node.js process metrics with stackhr_node_ prefix', async () => {
    const metricsOutput = await service.getMetrics();
    expect(metricsOutput).toContain(
      'stackhr_node_process_cpu_user_seconds_total',
    );
    expect(metricsOutput).toContain(
      'stackhr_node_nodejs_heap_size_total_bytes',
    );
    expect(service.getContentType()).toContain('text/plain');
  });
});
