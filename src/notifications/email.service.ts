import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
}

export interface SendEmailResult {
  id: string;
}

interface SendByteResponse {
  id?: unknown;
  error?: unknown;
}

@Injectable()
export class EmailService {
  private readonly endpoint = 'https://api.sendbyte.africa/v1/emails';
  private readonly from =
    process.env.SENDBYTE_FROM_EMAIL ?? 'StackHR <noreply@stackhr.app>';

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.SENDBYTE_API_KEY ?? process.env.SENDBYTE_KEY;

    if (!apiKey) {
      throw new ServiceUnavailableException('Email service is not configured');
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.idempotencyKey
          ? { idempotency_key: input.idempotencyKey }
          : {}),
      }),
    });

    const body = (await response
      .json()
      .catch(() => null)) as SendByteResponse | null;

    if (!response.ok) {
      throw new ServiceUnavailableException(
        this.getProviderError(body) ?? 'SendByte rejected the email request',
      );
    }

    if (!body || typeof body.id !== 'string' || !body.id) {
      throw new ServiceUnavailableException(
        'SendByte returned an invalid email response',
      );
    }

    return { id: body.id };
  }

  private getProviderError(body: SendByteResponse | null): string | null {
    if (!body || typeof body.error !== 'object' || body.error === null) {
      return null;
    }

    const error = body.error as { message?: unknown };
    return typeof error.message === 'string' ? error.message : null;
  }
}
