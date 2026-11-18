import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfOriginGuard } from './csrf-origin.guard';

function mockContext(
  method: string,
  url: string,
  headers: Record<string, string | undefined> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        url,
        originalUrl: url,
        headers,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('CsrfOriginGuard', () => {
  const guard = new CsrfOriginGuard([
    'https://app.stackhr.app',
    'http://localhost:3000',
  ]);

  it('allows safe methods without Origin or Referer', () => {
    expect(guard.canActivate(mockContext('GET', '/v1/api/auth/me'))).toBe(true);
    expect(guard.canActivate(mockContext('HEAD', '/v1/api/health'))).toBe(true);
    expect(guard.canActivate(mockContext('OPTIONS', '/v1/api/billing'))).toBe(
      true,
    );
  });

  it('allows mutating requests with an allowed Origin header', () => {
    expect(
      guard.canActivate(
        mockContext('POST', '/v1/api/billing/cancel', {
          origin: 'https://app.stackhr.app',
        }),
      ),
    ).toBe(true);
  });

  it('falls back to Referer origin when Origin is absent', () => {
    expect(
      guard.canActivate(
        mockContext('DELETE', '/v1/api/employees/123', {
          referer: 'http://localhost:3000/employees?tab=active',
        }),
      ),
    ).toBe(true);
  });

  it('rejects mutating requests when both Origin and Referer are missing', () => {
    expect(() =>
      guard.canActivate(mockContext('POST', '/v1/api/billing/cancel')),
    ).toThrow(ForbiddenException);
  });

  it('rejects mutating requests from untrusted origins', () => {
    expect(() =>
      guard.canActivate(
        mockContext('PATCH', '/v1/api/payroll/runs/1', {
          origin: 'https://evil.example.com',
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects mutating requests with malformed Referer', () => {
    expect(() =>
      guard.canActivate(
        mockContext('POST', '/v1/api/auth/logout', {
          referer: 'not-a-valid-url',
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('excludes signature-verified Anchor and Bachs webhooks', () => {
    expect(guard.canActivate(mockContext('POST', '/banking/webhook'))).toBe(
      true,
    );
    expect(
      guard.canActivate(mockContext('POST', '/v1/api/banking/webhook')),
    ).toBe(true);
    expect(
      guard.canActivate(mockContext('POST', '/v1/api/billing/webhooks/bachs')),
    ).toBe(true);
  });
});
