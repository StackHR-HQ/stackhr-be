import { ServiceUnavailableException } from '@nestjs/common';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const originalApiKey = process.env.SENDBYTE_API_KEY;
  const originalLegacyKey = process.env.SENDBYTE_KEY;
  const originalFromEmail = process.env.SENDBYTE_FROM_EMAIL;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    process.env.SENDBYTE_API_KEY = 'test-api-key';
    delete process.env.SENDBYTE_KEY;
    delete process.env.SENDBYTE_FROM_EMAIL;
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();

    if (originalApiKey === undefined) {
      delete process.env.SENDBYTE_API_KEY;
    } else {
      process.env.SENDBYTE_API_KEY = originalApiKey;
    }

    if (originalLegacyKey === undefined) {
      delete process.env.SENDBYTE_KEY;
    } else {
      process.env.SENDBYTE_KEY = originalLegacyKey;
    }

    if (originalFromEmail === undefined) {
      delete process.env.SENDBYTE_FROM_EMAIL;
    } else {
      process.env.SENDBYTE_FROM_EMAIL = originalFromEmail;
    }
  });

  it('sends an email through SendByte with the configured payload', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_123' }), { status: 202 }),
    );

    const result = await new EmailService().send({
      to: 'employee@example.com',
      subject: 'Welcome to StackHR',
      html: '<p>Welcome</p>',
      text: 'Welcome',
      idempotencyKey: 'welcome-user-123',
    });

    expect(result).toEqual({ id: 'email_123' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.sendbyte.africa/v1/emails',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'StackHR <noreply@stackhr.app>',
          to: 'employee@example.com',
          subject: 'Welcome to StackHR',
          html: '<p>Welcome</p>',
          text: 'Welcome',
          idempotency_key: 'welcome-user-123',
        }),
      },
    );
  });

  it('uses the legacy SENDBYTE_KEY when the new key is absent', async () => {
    delete process.env.SENDBYTE_API_KEY;
    process.env.SENDBYTE_KEY = 'legacy-api-key';
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_legacy' }), { status: 200 }),
    );

    await new EmailService().send({
      to: 'employee@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: 'Bearer legacy-api-key',
      }),
    });
  });

  it('rejects when no SendByte API key is configured', async () => {
    delete process.env.SENDBYTE_API_KEY;
    delete process.env.SENDBYTE_KEY;

    await expect(
      new EmailService().send({
        to: 'employee@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the provider error when SendByte rejects the request', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'Sender domain is not verified' } }),
        { status: 403 },
      ),
    );

    await expect(
      new EmailService().send({
        to: 'employee@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      }),
    ).rejects.toThrow('Sender domain is not verified');
  });

  it('rejects a successful response without an email id', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'queued' }), { status: 202 }),
    );

    await expect(
      new EmailService().send({
        to: 'employee@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      }),
    ).rejects.toThrow('SendByte returned an invalid email response');
  });
});
