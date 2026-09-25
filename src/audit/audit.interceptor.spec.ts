import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let auditServiceMock: { log: jest.Mock };

  beforeEach(() => {
    auditServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    interceptor = new AuditInterceptor(
      auditServiceMock as unknown as AuditService,
    );
  });

  it('should skip GET requests (read-only operations)', (done) => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/v1/api/employees',
        }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: () => of({ data: 'ok' }),
    } as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      complete: () => {
        expect(auditServiceMock.log).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should intercept POST mutations and trigger audit logging', (done) => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/v1/api/onboarding/employees',
          route: { path: '/v1/api/onboarding/employees' },
          body: { fullName: 'Jane Doe' },
          user: { id: 'usr-1', organizationId: 'org-1' },
          ip: '127.0.0.1',
          headers: { 'user-agent': 'JestTest' },
        }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: () => of({ employee: { id: 'emp-999' } }),
    } as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      complete: () => {
        expect(auditServiceMock.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'POST /v1/api/onboarding/employees',
            actorId: 'usr-1',
            organizationId: 'org-1',
            resource: 'onboarding',
            resourceId: 'emp-999',
          }),
        );
        done();
      },
    });
  });
});
