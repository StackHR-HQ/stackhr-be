import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { RequestContextStore } from './request-context.types';

@Injectable()
export class RequestContextService {
  private static readonly storage =
    new AsyncLocalStorage<RequestContextStore>();

  static run<R>(store: RequestContextStore, callback: () => R): R {
    return this.storage.run(store, callback);
  }

  static getStore(): RequestContextStore | undefined {
    return this.storage.getStore();
  }

  static set<K extends keyof RequestContextStore>(
    key: K,
    value: RequestContextStore[K],
  ): void {
    const store = this.storage.getStore();
    if (store) {
      store[key] = value;
    }
  }

  static get<K extends keyof RequestContextStore>(
    key: K,
  ): RequestContextStore[K] | undefined {
    const store = this.storage.getStore();
    return store ? store[key] : undefined;
  }

  static getCorrelationId(): string | undefined {
    return this.get('correlationId');
  }

  static getTraceId(): string | undefined {
    return this.get('traceId');
  }

  static getSpanId(): string | undefined {
    return this.get('spanId');
  }

  static getOrganizationId(): string | null | undefined {
    return this.get('organizationId');
  }

  static getUserId(): string | null | undefined {
    return this.get('userId');
  }

  static getDurationMs(): number | undefined {
    const startTime = this.get('startTime');
    return startTime ? Date.now() - startTime : undefined;
  }
}
