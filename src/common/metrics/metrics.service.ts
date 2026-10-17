import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;

  // HTTP Metrics
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDurationSeconds: Histogram<string>;

  // Idempotency Metrics
  public readonly idempotencyOperationsTotal: Counter<string>;

  // Outbox & DLQ Metrics
  public readonly outboxEventsTotal: Counter<string>;
  public readonly outboxDlqDepth: Gauge<string>;

  // Circuit Breaker Metrics
  public readonly circuitBreakerState: Gauge<string>;

  constructor() {
    this.registry = new Registry();

    this.httpRequestsTotal = new Counter({
      name: 'stackhr_http_requests_total',
      help: 'Total number of HTTP requests processed by StackHR backend',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'stackhr_http_request_duration_seconds',
      help: 'HTTP request latency in seconds across P50, P90, P95, and P99 percentiles',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.idempotencyOperationsTotal = new Counter({
      name: 'stackhr_idempotency_operations_total',
      help: 'Total idempotency engine operations (lease reservations, replays, conflicts, tampering)',
      labelNames: ['action', 'operation'],
      registers: [this.registry],
    });

    this.outboxEventsTotal = new Counter({
      name: 'stackhr_outbox_events_total',
      help: 'Total transactional outbox domain events published, failed, or routed to DLQ',
      labelNames: ['event_type', 'status'],
      registers: [this.registry],
    });

    this.outboxDlqDepth = new Gauge({
      name: 'stackhr_outbox_dlq_depth',
      help: 'Current number of dead-lettered events requiring operator attention',
      registers: [this.registry],
    });

    this.circuitBreakerState = new Gauge({
      name: 'stackhr_circuit_breaker_state',
      help: 'Current state of external client circuit breakers (0 = CLOSED, 1 = HALF_OPEN, 2 = OPEN)',
      labelNames: ['breaker_name'],
      registers: [this.registry],
    });
  }

  onModuleInit() {
    // Automatically scrape Node.js process metrics (GC, Heap, CPU, Event Loop Lag, File Descriptors)
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'stackhr_node_',
    });
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ) {
    const labels = {
      method: method.toUpperCase(),
      route: route || 'unknown',
      status_code: String(statusCode),
    };

    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationSeconds);
  }

  recordIdempotency(
    action: 'lease_acquired' | 'replayed' | 'conflict_409' | 'tampered_422',
    operation = 'default',
  ) {
    this.idempotencyOperationsTotal.inc({ action, operation });
  }

  recordOutboxEvent(
    eventType: string,
    status: 'published' | 'failed' | 'dlq_routed',
  ) {
    this.outboxEventsTotal.inc({ event_type: eventType, status });
  }

  setCircuitBreakerState(
    breakerName: string,
    state: 'CLOSED' | 'HALF_OPEN' | 'OPEN',
  ) {
    const numericState = state === 'CLOSED' ? 0 : state === 'HALF_OPEN' ? 1 : 2;
    this.circuitBreakerState.set({ breaker_name: breakerName }, numericState);
  }

  setDlqDepth(count: number) {
    this.outboxDlqDepth.set(count);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
