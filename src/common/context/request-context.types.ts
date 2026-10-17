export interface RequestContextStore {
  correlationId: string;
  traceId: string;
  spanId?: string;
  organizationId?: string | null;
  userId?: string | null;
  startTime: number;
  [key: string]: unknown;
}
