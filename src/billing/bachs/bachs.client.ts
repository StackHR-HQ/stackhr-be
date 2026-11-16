import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CircuitBreaker } from '../../common/resilience/circuit-breaker';
import { executeWithRetry } from '../../common/resilience/retry-policy';
import type {
  BachsCheckout,
  BachsCreateCheckoutParams,
  BachsCreateCustomerParams,
  BachsCustomer,
} from './bachs.types';

/** NGN rails only: StackHR bills in naira. */
const NGN_PAYMENT_METHODS = ['NGN_CARD', 'NGN_BANK_TRANSFER'];

/**
 * Thin client for Bachs Payments. Bachs Subscriptions is deliberately NOT used
 * (USD cards only); each StackHR invoice is collected via a one-time checkout.
 */
@Injectable()
export class BachsClient {
  private readonly logger = new Logger(BachsClient.name);
  private readonly baseUrl: string;
  private readonly secretKey: string | undefined;
  private readonly circuitBreaker = new CircuitBreaker({
    name: 'BachsPayments',
    failureThreshold: 5,
    recoveryTimeoutMs: 30000,
  });

  constructor() {
    this.baseUrl =
      process.env.BACHS_BASE_URL?.replace(/\/+$/, '') ??
      'https://sandbox-api.bachs.io';
    this.secretKey = process.env.BACHS_SECRET_KEY;
  }

  isMockMode(): boolean {
    return !this.secretKey || process.env.NODE_ENV === 'test';
  }

  async createCustomer(
    params: BachsCreateCustomerParams,
    idempotencyKey: string,
  ): Promise<BachsCustomer> {
    if (this.isMockMode()) {
      return { customerId: `cust_mock_${randomUUID().slice(0, 8)}` };
    }
    const json = await this.post('/v1/customers', idempotencyKey, {
      email: params.email,
      name: params.name ?? undefined,
      metadata: params.metadata,
    });
    return { customerId: json.customer_id };
  }

  async createCheckoutSession(
    params: BachsCreateCheckoutParams,
  ): Promise<BachsCheckout> {
    if (this.isMockMode()) {
      const checkoutId = `chk_mock_${randomUUID().slice(0, 8)}`;
      return {
        checkoutId,
        checkoutUrl: `${params.successUrl}${params.successUrl.includes('?') ? '&' : '?'}checkout_id=${checkoutId}&mock=1`,
        expiresAt: new Date(
          Date.now() + (params.expiresInMinutes ?? 60) * 60_000,
        ),
      };
    }
    const json = await this.post('/v1/checkout-sessions', params.reference, {
      customer: { customer_id: params.customerId },
      pricing: { currency: 'NGN', amount: params.amount },
      billing_currency: 'NGN',
      payment_method_types: NGN_PAYMENT_METHODS,
      reference: params.reference,
      metadata: params.metadata,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      expires_in_minutes: params.expiresInMinutes ?? 60,
      save_payment_method: params.savePaymentMethod ?? false,
    });
    return {
      checkoutId: json.checkout_id,
      checkoutUrl: json.checkout_url,
      expiresAt: new Date(json.expires_at),
    };
  }

  private async post(
    path: string,
    idempotencyKey: string,
    body: Record<string, unknown>,
  ): Promise<any> {
    return this.circuitBreaker.execute(() =>
      executeWithRetry(
        async () => {
          const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.secretKey}`,
              // Same key on retry → Bachs returns the original result.
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(
              `Bachs POST ${path} failed [${response.status}]: ${errorText}`,
            );
            if (response.status >= 500 || response.status === 429) {
              throw new ServiceUnavailableException(
                'Payment provider is temporarily unavailable',
              );
            }
            throw new BadRequestException(
              'Payment provider rejected the request',
            );
          }
          return response.json();
        },
        { maxRetries: 2, initialDelayMs: 300, maxDelayMs: 2000 },
      ),
    );
  }
}
