import {
  getTenantContext,
  runBypassingTenantContext,
  runWithTenantContext,
} from './tenant-context';
import { PrismaService } from './prisma.service';

describe('Tenant Isolation Infrastructure', () => {
  describe('TenantContextStorage', () => {
    it('should store and retrieve organizationId in async context', () => {
      runWithTenantContext({ organizationId: 'org-tenant-123' }, () => {
        const context = getTenantContext();
        expect(context?.organizationId).toBe('org-tenant-123');
        expect(context?.isBypassed).toBeFalsy();
      });
    });

    it('should isolate distinct concurrent tenant contexts', async () => {
      const p1 = new Promise<string | null>((resolve) => {
        void runWithTenantContext({ organizationId: 'tenant-A' }, async () => {
          await new Promise((r) => setTimeout(r, 10));
          resolve(getTenantContext()?.organizationId ?? null);
        });
      });

      const p2 = new Promise<string | null>((resolve) => {
        void runWithTenantContext({ organizationId: 'tenant-B' }, async () => {
          await new Promise((r) => setTimeout(r, 5));
          resolve(getTenantContext()?.organizationId ?? null);
        });
      });

      const [resA, resB] = await Promise.all([p1, p2]);
      expect(resA).toBe('tenant-A');
      expect(resB).toBe('tenant-B');
    });

    it('should allow bypassing tenant context when explicitly requested', () => {
      runWithTenantContext({ organizationId: 'tenant-A' }, () => {
        runBypassingTenantContext(() => {
          const context = getTenantContext();
          expect(context?.organizationId).toBe('tenant-A');
          expect(context?.isBypassed).toBe(true);
        });

        // Context reverts back outside bypass block
        const context = getTenantContext();
        expect(context?.isBypassed).toBeFalsy();
      });
    });
  });

  describe('PrismaService Tenant Extension Proxy', () => {
    beforeAll(() => {
      process.env.DATABASE_URL =
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/stackhr_test';
    });

    it('should correctly identify tenant scoped models', () => {
      const service = new PrismaService();
      expect(service.capitalizeModelName('employee')).toBe('Employee');
      expect(service.capitalizeModelName('member')).toBe('Member');
      expect(service.capitalizeModelName('invitation')).toBe('Invitation');
      expect(service.capitalizeModelName('approvalRequest')).toBe(
        'ApprovalRequest',
      );
    });
  });
});
