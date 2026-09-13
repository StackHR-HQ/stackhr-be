import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  organizationId: string | null;
  isBypassed?: boolean;
}

export const tenantAsyncLocalStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantContext(): TenantStore | undefined {
  return tenantAsyncLocalStorage.getStore();
}

export function runWithTenantContext<T>(
  store: TenantStore,
  callback: () => T,
): T {
  return tenantAsyncLocalStorage.run(store, callback);
}

export function runBypassingTenantContext<T>(callback: () => T): T {
  const current = getTenantContext();
  return tenantAsyncLocalStorage.run(
    { organizationId: current?.organizationId ?? null, isBypassed: true },
    callback,
  );
}
