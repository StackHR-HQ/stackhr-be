import * as crypto from 'crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AnchorWebhookGuard } from './anchor-webhook.guard';

describe('AnchorWebhookGuard', () => {
  const secret = 'whsec_test_secret_123456';
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANCHOR_WEBHOOK_SECRET: secret };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createMockContext(
    headers: Record<string, string>,
    body: any,
    rawBody?: Buffer,
  ): ExecutionContext {
    const req = {
      headers,
      body,
      rawBody: rawBody ?? Buffer.from(JSON.stringify(body)),
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  }

  it('should throw UnauthorizedException when secret is missing and not in test env', () => {
    delete process.env.ANCHOR_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';

    const guard = new AnchorWebhookGuard();
    const context = createMockContext({}, { test: 1 });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if x-anchor-signature header is missing', () => {
    const guard = new AnchorWebhookGuard();
    const context = createMockContext({}, { event: 'deposit.successful' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(
      'Missing x-anchor-signature header',
    );
  });

  it('should throw UnauthorizedException if signature does not match', () => {
    const guard = new AnchorWebhookGuard();
    const context = createMockContext(
      { 'x-anchor-signature': 'invalid_signature_base64' },
      { event: 'deposit.successful' },
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(
      'Invalid webhook signature',
    );
  });

  it('should allow valid signature using HMAC-SHA1 base64', () => {
    const guard = new AnchorWebhookGuard();
    const payload = {
      event: 'deposit.successful',
      data: { id: 'txn_123', type: 'Transaction' },
    };
    const rawString = JSON.stringify(payload);
    const validSignature = crypto
      .createHmac('sha1', secret)
      .update(rawString)
      .digest('base64');

    const context = createMockContext(
      { 'x-anchor-signature': validSignature },
      payload,
      Buffer.from(rawString),
    );

    expect(guard.canActivate(context)).toBe(true);
  });
});
