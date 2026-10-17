export interface CreateOutboxEventParams {
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  maxRetries?: number;
}

export interface OutboxProcessResult {
  processedCount: number;
  failedCount: number;
  deadLetterCount: number;
}
