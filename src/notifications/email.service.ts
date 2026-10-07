import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

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

export interface SubscribeToListInput {
  email: string;
  name?: string;
  attributes?: Record<string, unknown>;
}

interface SendByteResponse {
  id?: unknown;
  error?: unknown;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
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

  /**
   * Adds a contact to a SendByte marketing list via the list import endpoint.
   * Requires SENDBYTE_BRAND_ID and SENDBYTE_WAITLIST_LIST_ID env vars.
   * This method does NOT throw on failure — it logs a warning instead,
   * making it safe to call fire-and-forget from the waitlist flow.
   */
  async subscribeToList(input: SubscribeToListInput): Promise<void> {
    const apiKey = process.env.SENDBYTE_API_KEY ?? process.env.SENDBYTE_KEY;
    const brandId = process.env.SENDBYTE_BRAND_ID;
    const listId = process.env.SENDBYTE_WAITLIST_LIST_ID;

    if (!apiKey || !brandId || !listId) {
      this.logger.warn(
        'SendByte list subscription skipped: SENDBYTE_API_KEY, SENDBYTE_BRAND_ID, or SENDBYTE_WAITLIST_LIST_ID is not configured',
      );
      return;
    }

    const url = `https://api.sendbyte.africa/v1/brands/${brandId}/lists/${listId}/import`;

    const subscriber: Record<string, unknown> = {
      email: input.email,
    };
    if (input.name) {
      subscriber.name = input.name;
    }
    if (input.attributes && Object.keys(input.attributes).length > 0) {
      subscriber.attributes = input.attributes;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscribers: [subscriber],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'no body');
        this.logger.warn(
          `SendByte list subscribe failed (${response.status}): ${errorBody}`,
        );
        return;
      }

      this.logger.log(
        `Successfully subscribed ${input.email} to SendByte list ${listId}`,
      );
    } catch (error: any) {
      this.logger.warn(
        `SendByte list subscribe error for ${input.email}: ${error?.message ?? error}`,
      );
    }
  }

  private getProviderError(body: SendByteResponse | null): string | null {
    if (!body || typeof body.error !== 'object' || body.error === null) {
      return null;
    }

    const error = body.error as { message?: unknown };
    return typeof error.message === 'string' ? error.message : null;
  }
}
